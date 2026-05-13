import { NextRequest, NextResponse } from 'next/server';
import { callTracked } from '@/lib/ai/track-call';
import { getAnalyzeSystemPrompt, getAnalyzeUserPrompt } from '@/lib/ai/prompts/analyze';
import { AIProvider } from '@/types';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const {
      ownProduct,
      competitors,
      segment,
      market,
      locale = 'en',
      aiProvider = 'claude',
      apiKey,
      model,
    } = body;
    const zh = locale === 'zh';

    if (!apiKey) {
      return NextResponse.json(
        { error: zh ? '请先在设置中配置 API Key' : 'API key is required. Please configure it in Settings.' },
        { status: 400 }
      );
    }

    if (!ownProduct || !competitors || competitors.length === 0) {
      return NextResponse.json(
        { error: zh ? '需要自家产品和至少一个竞品' : 'Own product and at least one competitor are required.' },
        { status: 400 }
      );
    }

    const systemPrompt = getAnalyzeSystemPrompt(locale);
    const userPrompt = getAnalyzeUserPrompt(ownProduct, competitors, segment, market);

    const response = await callTracked({
      userId,
      action: 'ai_analyze',
      provider: aiProvider as AIProvider,
      apiKey,
      model,
      maxTokens: 8192,           // bump from default 4096 — analyze output for many features can be ~5-7K tokens
      cacheSystemPrompt: true,   // Claude only; system prompt (~1500 tokens) reused across analyses
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    if (response.stopReason === 'max_tokens') {
      console.warn('[analyze] Output truncated; competitors:', competitors.length, 'features:', Object.keys(ownProduct.params || {}).length);
      return NextResponse.json(
        { error: zh ? 'AI 输出超长被截断，请减少竞品或参数数量重试' : 'AI output was truncated. Try fewer competitors or features.', raw: response.content },
        { status: 500 }
      );
    }

    // Parse JSON response
    let result;
    try {
      const cleaned = response.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      result = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: zh ? 'AI 返回格式异常，请重试' : 'Failed to parse AI response', raw: response.content },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const res = handleAuthError(error);
    if (res) return res;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
