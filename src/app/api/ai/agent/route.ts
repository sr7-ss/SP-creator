import { NextRequest } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/session';
import { runAgent, isAnthropicCompatible } from '@/lib/ai/agent';
import { prisma } from '@/lib/db/client';
import { decrypt } from '@/lib/crypto';

export const maxDuration = 120; // Allow up to 2 minutes for agent execution

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth();

    const { projectId, message, locale = 'zh', aiProvider, apiKey, model, packagingProvider, packagingApiKey, packagingModel, ownProductName: clientOwnName, ownProductParams: clientOwnParams, skipPackaging } = await req.json();
    const zh = locale === 'zh';

    if (!projectId || !message) {
      return new Response(JSON.stringify({ error: zh ? '缺少项目 ID 或消息内容' : 'projectId and message are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Load project with own product
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: { products: { where: { isOwnProduct: true }, take: 1 } },
    });

    if (!project) {
      return new Response(JSON.stringify({ error: zh ? '项目不存在' : 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ownProduct = project.products[0];
    // Allow client-provided own product params (agent mode enters params directly)
    const hasClientOwnParams = clientOwnParams && typeof clientOwnParams === 'object' && Object.keys(clientOwnParams).length > 0;
    if (!ownProduct && !hasClientOwnParams) {
      return new Response(JSON.stringify({ error: zh ? '请先添加自家产品参数' : 'Please add your product first.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Resolve AI config: prefer request body (localStorage routing), fallback to DB
    let orchProvider = aiProvider || 'claude';
    let orchApiKey = apiKey || '';
    let orchModel = model || 'claude-sonnet-4-20250514';
    // Packaging config: prefer explicit routing from request, else mirror orchestration
    let pkgProvider = packagingProvider || orchProvider;
    let pkgApiKey = packagingApiKey || orchApiKey;
    let pkgModel = packagingModel || orchModel;

    // If no key from request body, try DB
    if (!orchApiKey) {
      const aiKeys = await prisma.userAIKey.findMany({ where: { userId } });
      const zhipuKey = aiKeys.find(k => k.provider === 'zhipu');
      const claudeKey = aiKeys.find(k => k.provider === 'claude');

      if (zhipuKey) {
        orchProvider = 'zhipu';
        orchApiKey = decrypt(zhipuKey.encryptedKey);
        orchModel = zhipuKey.model || 'glm-4-flash';
      } else if (claudeKey) {
        orchProvider = 'claude';
        orchApiKey = decrypt(claudeKey.encryptedKey);
        orchModel = claudeKey.model || 'claude-sonnet-4-20250514';
      }

      // Only override packaging from DB if not explicitly routed from frontend
      if (!packagingApiKey) {
        if (claudeKey) {
          pkgProvider = 'claude';
          pkgApiKey = decrypt(claudeKey.encryptedKey);
          pkgModel = claudeKey.model || 'claude-sonnet-4-20250514';
        } else {
          pkgProvider = orchProvider;
          pkgApiKey = orchApiKey;
          pkgModel = orchModel;
        }
      }
    }

    if (!orchApiKey) {
      return new Response(JSON.stringify({
        error: zh
          ? '未配置 AI API Key，请在设置页添加（推荐智谱，免费）'
          : 'No AI API key configured. Please add one in Settings.',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Agent orchestration requires Anthropic-compatible provider
    if (!isAnthropicCompatible(orchProvider)) {
      return new Response(JSON.stringify({
        error: zh
          ? `Agent 模式需要支持 Anthropic 协议的模型（Claude、智谱、Kimi、MiniMax）。当前选择的 "${orchProvider}" 不兼容，请在设置页切换。`
          : `Agent mode requires an Anthropic-compatible provider (Claude, Zhipu, Kimi, or MiniMax). Current provider "${orchProvider}" is not compatible.`,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // SSE stream — agent continues even if client disconnects
    const encoder = new TextEncoder();
    let streamClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          if (streamClosed) return; // client disconnected, skip SSE but keep running
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Stream closed by client — mark but don't abort agent
            streamClosed = true;
          }
        };

        try {
          // Merge client-provided params with DB params (ownProduct may be null in agent mode)
          const dbParams = (ownProduct?.params && typeof ownProduct.params === 'object') ? ownProduct.params as Record<string, string> : {};
          const mergedOwnParams = { ...dbParams, ...(clientOwnParams || {}) };
          const resolvedOwnName = clientOwnName || ownProduct?.name || 'Own Product';

          const result = await runAgent(
            {
              projectId,
              userId,
              ownProductName: resolvedOwnName,
              ownProductParams: mergedOwnParams,
              market: project.market || '',
              segment: project.segment || undefined,
              locale,
              orchestrationProvider: orchProvider,
              orchestrationApiKey: orchApiKey,
              orchestrationModel: orchModel,
              packagingProvider: pkgProvider,
              packagingApiKey: pkgApiKey,
              packagingModel: pkgModel,
              skipPackaging: !!skipPackaging,
            },
            message,
            (event) => send('progress', event)
          );

          // Per-iteration tokens are recorded inside agent-runner.ts
          send('done', result);
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : 'Agent execution failed';
          // Translate common errors
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
        // Client disconnected — mark stream as closed but don't interrupt agent
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
