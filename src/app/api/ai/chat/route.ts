/**
 * Chat API — streaming conversation endpoint for the sidebar chat.
 * Accepts conversation history + project context, returns SSE stream.
 */
import { NextRequest } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/session';
import { callTracked } from '@/lib/ai/track-call';
import { AIProvider } from '@/types';
import { prisma } from '@/lib/db/client';
import { decrypt } from '@/lib/crypto';

export const maxDuration = 60;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await req.json();

    const {
      messages,
      projectContext,
      locale = 'zh',
      aiProvider = 'claude',
      apiKey: clientApiKey,
      model,
    } = body as {
      messages: ChatMessage[];
      projectContext?: string;
      locale?: string;
      aiProvider?: string;
      apiKey?: string;
      model?: string;
    };

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'No messages provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Resolve API key
    let apiKey = clientApiKey || '';
    if (!apiKey) {
      const userKey = await prisma.userAIKey.findUnique({
        where: { userId_provider: { userId, provider: aiProvider } },
      });
      if (userKey) apiKey = decrypt(userKey.encryptedKey);
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: locale === 'zh' ? '请先配置 API Key' : 'API key required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const zh = locale === 'zh';
    const systemPrompt = zh
      ? `<role>
你是 SP Creator 的 AI 助手，一位有丰富经验的手机产品营销顾问。
你的能力：竞品分析、卖点分级、包装文案优化、用户评论解读、市场定位建议。
你的立场：站在用户（产品经理）的角度，帮他做出更好的卖点决策。
</role>

<context>
${projectContext || '（暂无项目上下文）'}
</context>

<style>
- 先给结论（1 句话），再展开要点（2-3 条）
- 肯定用户做得好的地方，再给改进建议
- 不说废话，每句话都要有信息量
- 给建议时附上具体理由，不要空泛的"建议优化"
- 用中文回复
</style>`
      : `<role>
You are the SP Creator AI, an experienced mobile product marketing consultant.
Your capabilities: competitive analysis, SP tiering, packaging copy optimization, review interpretation, market positioning.
Your stance: help the user (product manager) make better selling point decisions.
</role>

<context>
${projectContext || '(No project context available)'}
</context>

<style>
- Lead with conclusion (1 sentence), then expand with 2-3 key points
- Acknowledge what the user did well before suggesting improvements
- Every sentence should carry information — no filler
- Back suggestions with specific reasoning
- Respond in English
</style>`;

    // Build messages for the provider
    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    // Stream response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await callTracked({
            userId,
            action: 'ai_chat',
            provider: aiProvider as AIProvider,
            apiKey,
            model,
            messages: chatMessages,
          });
          // Send the full response as a stream of chunks
          const content = result.content;
          const chunkSize = 20; // characters per chunk for smooth streaming effect
          for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.slice(i, i + chunkSize);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: chunk })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Chat failed';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: unknown) {
    const res = handleAuthError(error);
    if (res) return res;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
