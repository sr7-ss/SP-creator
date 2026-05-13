import { NextRequest, NextResponse } from 'next/server';
import { AIProvider } from '@/types';
import { parseProductsFromText } from '@/lib/analysis/text-parser';
import { prisma } from '@/lib/db/client';
import { requireAuth, handleAuthError } from '@/lib/auth/session';
import { checkAndDeductCredit } from '@/lib/auth/credits';
import { decrypt } from '@/lib/crypto';
import { logUsage } from '@/lib/ai/usage-logger';
import { callTracked } from '@/lib/ai/track-call';
import { PARSE_PARAMS_SYSTEM_PROMPT } from '@/lib/ai/prompts/parse-params';

const SYSTEM_PROMPT = PARSE_PARAMS_SYSTEM_PROMPT;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const {
      text,
      imageBase64,
      locale = 'zh',
      aiProvider = 'claude',
      model,
    } = body;
    const zh = locale === 'zh';

    if (!text && !imageBase64) {
      return NextResponse.json(
        { error: zh ? '请输入文本或上传图片' : 'Text or image is required.' },
        { status: 400 }
      );
    }

    // ── Fast path: try regex-based parsing for text input (no AI needed) ──
    // This does NOT require an API key or credits.
    if (text && !imageBase64) {
      const regexResult = parseProductsFromText(text);
      if (regexResult && regexResult.length >= 2) {
        console.log('[parse-params] Regex parser succeeded, skipping AI call');
        return NextResponse.json({ products: regexResult });
      }
      // Regex failed → fall through to AI
    }

    // ── AI path: need API key and credits ──
    // Try DB first, fall back to request body (backward compat with localStorage settings)
    let apiKey = '';
    try {
      const userKey = await prisma.userAIKey.findUnique({
        where: { userId_provider: { userId, provider: aiProvider } },
      });
      if (userKey) {
        apiKey = decrypt(userKey.encryptedKey);
      }
    } catch {
      // DB unreachable — fall through to request body key
    }
    if (!apiKey && body.apiKey) {
      apiKey = body.apiKey;
    }
    if (!apiKey) {
      return NextResponse.json(
        { error: zh ? '请先在设置中配置 API Key' : 'No API key configured. Please configure it in Settings.' },
        { status: 400 }
      );
    }

    const creditCheck = await checkAndDeductCredit(userId, 'ai_parse_params', aiProvider, model || '');
    if (!creditCheck.ok) {
      return NextResponse.json({ error: creditCheck.error }, { status: 403 });
    }

    // ── Helper: fetch with 429 retry ──
    async function fetchWithRetry(url: string, opts: RequestInit, maxRetries = 2): Promise<Response> {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, opts);
        if (response.status === 429 && attempt < maxRetries) {
          // Read retry-after header or default to exponential backoff
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : (attempt + 1) * 2000;
          console.log(`[parse-params] 429 rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }
        return response;
      }
      // Shouldn't reach here, but TypeScript needs it
      return fetch(url, opts);
    }

    // ── Helper: format API error ──
    function formatApiError(status: number, errorText: string): string {
      if (status === 429) {
        return zh
          ? 'AI 模型调用频率超限，请稍后重试或在设置中切换其他模型'
          : 'AI rate limit exceeded. Please wait a moment or switch to another model in Settings.';
      }
      if (status === 401 || status === 403) {
        return zh
          ? 'API Key 无效或已过期，请在设置中检查'
          : 'Invalid API key. Please check Settings.';
      }
      if (status === 404) {
        return zh
          ? '所选模型不可用，请在设置中切换模型'
          : 'Selected model unavailable. Please switch models in Settings.';
      }
      if (status === 502 || status === 503) {
        return zh
          ? '服务提供商临时过载，请稍后切换AI大模型后再试～'
          : 'AI provider is temporarily overloaded. Please switch models and retry.';
      }
      return zh ? `AI 接口错误 (${status})，请重试` : `AI API error: ${status} - ${errorText.slice(0, 100)}`;
    }

    // Build user message content
    if (imageBase64) {
      // For image parsing, convert image to a data URL description for the AI
      // Claude uses vision API, OpenAI-compatible providers use image_url
      if (aiProvider === 'claude') {
        // Use Claude's native vision API
        const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: model || 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: 'image/png',
                      data: imageBase64,
                    },
                  },
                  {
                    type: 'text',
                    text: 'Extract all product parameters from this image into the structured JSON format.',
                  },
                ],
              },
            ],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return NextResponse.json(
            { error: formatApiError(response.status, errorText) },
            { status: 500 }
          );
        }

        const data = await response.json();
        const content = data.content[0].text;
        console.log('[parse-params] Claude raw response:', content?.slice(0, 300));
        logUsage({ userId, action: 'ai_parse_params_image', provider: aiProvider, model: model || 'unknown', inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 });
        try {
          const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleaned);
          // Normalize: ensure response has { products: [...] } shape
          if (Array.isArray(parsed)) {
            return NextResponse.json({ products: parsed });
          }
          if (parsed.params && !parsed.products) {
            return NextResponse.json({ products: [parsed] });
          }
          return NextResponse.json(parsed);
        } catch {
          return NextResponse.json({ error: zh ? 'AI 返回格式异常，请重试' : 'Failed to parse response', raw: content }, { status: 500 });
        }
      }

      // OpenAI-compatible providers (OpenAI, Gemini, Minimax, Zhipu) — use image_url format
      const providerInstance = aiProvider === 'openai'
        ? { baseUrl: 'https://api.openai.com/v1/chat/completions' }
        : aiProvider === 'gemini'
        ? { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' }
        : aiProvider === 'minimax'
        ? { baseUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2' }
        : { baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' };

      // Use vision-capable models for image parsing
      const visionModels: Record<string, string> = {
        openai: 'gpt-4o',
        gemini: 'gemini-2.5-flash',
        minimax: 'MiniMax-Text-01',
        zhipu: 'glm-4v-plus',
      };

      const response = await fetchWithRetry(providerInstance.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: visionModels[aiProvider] || model || 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${imageBase64}`,
                  },
                },
                {
                  type: 'text',
                  text: 'Extract all product parameters from this image into the structured JSON format.',
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { error: formatApiError(response.status, errorText) },
          { status: 500 }
        );
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      console.log('[parse-params] OpenAI-compat raw response:', content?.slice(0, 300));
      logUsage({ userId, action: 'ai_parse_params_image', provider: aiProvider, model: model || 'unknown', inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 });
      try {
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          return NextResponse.json({ products: parsed });
        }
        if (parsed.params && !parsed.products) {
          return NextResponse.json({ products: [parsed] });
        }
        return NextResponse.json(parsed);
      } catch {
        return NextResponse.json({ error: zh ? 'AI 返回格式异常，请重试' : 'Failed to parse response', raw: content }, { status: 500 });
      }
    }

    // Text parsing — all providers
    const response = await callTracked({
      userId,
      action: 'ai_parse_params',
      provider: aiProvider as AIProvider,
      apiKey,
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Extract product parameters from this text:\n\n${text}` },
      ],
    });

    try {
      const cleaned = response.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return NextResponse.json({ products: parsed });
      }
      if (parsed.params && !parsed.products) {
        return NextResponse.json({ products: [parsed] });
      }
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({ error: zh ? 'AI 返回格式异常，请重试' : 'Failed to parse response', raw: response.content }, { status: 500 });
    }
  } catch (error: unknown) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
