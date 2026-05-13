import { NextRequest } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/session';
import { isAnthropicCompatible, runAgentLoop, type AgentRunnerConfig, type AgentContext } from '@/lib/ai/agent-runner';
import { prisma } from '@/lib/db/client';
import { decrypt } from '@/lib/crypto';
import { AgentType } from '@/types';
import { getDiscoveryAgentConfig } from '@/lib/ai/agents/discovery';
import { getReviewMiningAgentConfig } from '@/lib/ai/agents/review-mining';
import { getCreativeAgentConfig } from '@/lib/ai/agents/creative';
import { getResearchAgentConfig, runResearchPipeline } from '@/lib/ai/agents/research';

export const maxDuration = 120;

function resolveAgentConfig(agentType: AgentType, locale: string, payload: Record<string, unknown>): AgentRunnerConfig {
  switch (agentType) {
    case 'discovery':
      return getDiscoveryAgentConfig(locale);
    case 'reviews':
      return getReviewMiningAgentConfig(locale);
    case 'creative':
      return getCreativeAgentConfig(locale, payload.brandRules as string[] | undefined);
    case 'research':
      return getResearchAgentConfig(locale);
    default:
      throw new Error(`Agent type "${agentType}" is not implemented`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth();

    const {
      agentType,
      projectId,
      payload,
      locale = 'zh',
      aiProvider,
      apiKey,
      model,
    } = await req.json();

    const zh = locale === 'zh';

    if (!agentType) {
      return new Response(
        JSON.stringify({ error: zh ? '缺少 agentType' : 'agentType is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate agentType
    const validTypes: AgentType[] = ['discovery', 'reviews', 'creative', 'research'];
    if (!validTypes.includes(agentType)) {
      return new Response(
        JSON.stringify({ error: zh ? `无效的 agentType: ${agentType}` : `Invalid agentType: ${agentType}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Resolve AI config: prefer request body (localStorage routing), fallback to DB
    let resolvedProvider = aiProvider || 'claude';
    let resolvedApiKey = apiKey || '';
    let resolvedModel = model || 'claude-sonnet-4-20250514';

    if (!resolvedApiKey) {
      const aiKeys = await prisma.userAIKey.findMany({ where: { userId } });
      const zhipuKey = aiKeys.find((k) => k.provider === 'zhipu');
      const claudeKey = aiKeys.find((k) => k.provider === 'claude');

      if (zhipuKey) {
        resolvedProvider = 'zhipu';
        resolvedApiKey = decrypt(zhipuKey.encryptedKey);
        resolvedModel = zhipuKey.model || 'glm-4-flash';
      } else if (claudeKey) {
        resolvedProvider = 'claude';
        resolvedApiKey = decrypt(claudeKey.encryptedKey);
        resolvedModel = claudeKey.model || 'claude-sonnet-4-20250514';
      }
    }

    if (!resolvedApiKey) {
      return new Response(
        JSON.stringify({
          error: zh
            ? '未配置 AI API Key，请在设置页添加（推荐智谱，免费）'
            : 'No AI API key configured. Please add one in Settings.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[AgentStream] provider=${resolvedProvider} model=${resolvedModel} hasKey=${!!resolvedApiKey} agentType=${agentType}`);

    if (!isAnthropicCompatible(resolvedProvider)) {
      return new Response(
        JSON.stringify({
          error: zh
            ? `Agent 需要 Anthropic 协议兼容模型（Claude、智谱、Kimi、MiniMax），当前 "${resolvedProvider}" 不兼容。`
            : `Agent requires an Anthropic-compatible provider. "${resolvedProvider}" is not compatible.`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Resolve agent config
    const agentConfig = resolveAgentConfig(agentType as AgentType, locale, payload || {});

    // Build user message from payload
    const userMessage = payload?.message || payload?.query || JSON.stringify(payload || {});

    // SSE stream
    const encoder = new TextEncoder();
    let streamClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          if (streamClosed) return;
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            streamClosed = true;
          }
        };

        try {
          const context: AgentContext = {
            userId,
            projectId: projectId || undefined,
            locale,
            provider: resolvedProvider,
            apiKey: resolvedApiKey,
            model: resolvedModel,
            onProgress: (e) => send('progress', e),
            data: { ...(payload || {}) },
          };

          // Research uses direct pipeline (no agent loop / no tool_use)
          const result = agentType === 'research'
            ? await runResearchPipeline(context, userMessage, payload?.documentText as string | undefined)
            : await runAgentLoop(agentConfig, context, userMessage);
          send('done', result);
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : 'Agent execution failed';
          let msg = rawMsg;
          if (zh) {
            if (/insufficient.?balance|余额/i.test(rawMsg)) msg = 'AI 模型额度已用完，请充值或切换其他模型';
            else if (/429|quota|RESOURCE_EXHAUSTED/i.test(rawMsg)) msg = 'AI 调用频率超限，请稍后重试';
            else if (/401|403|API.?key|INVALID/i.test(rawMsg)) msg = 'API Key 无效或已过期，请检查设置';
            else if (/timeout|ECONNREFUSED/i.test(rawMsg)) msg = '网络连接失败，请检查网络';
            else msg = 'Agent 执行失败：' + (rawMsg.length > 80 ? rawMsg.slice(0, 80) + '…' : rawMsg);
          }
          send('error', { error: msg });
        } finally {
          if (!streamClosed) {
            try { controller.close(); } catch { /* already closed */ }
          }
        }
      },
      cancel() {
        streamClosed = true;
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
