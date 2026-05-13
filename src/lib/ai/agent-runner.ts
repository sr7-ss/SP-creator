/**
 * Generic agent loop infrastructure.
 * Extracted from the original agent.ts to be reused by multiple agent types
 * (discovery, reviews, creative).
 */

import Anthropic from '@anthropic-ai/sdk';
import { logTrackedCall } from '@/lib/ai/track-call';

// ─── Types ───────────────────────────────────────────────────────

export type ProgressCallback = (event: {
  step: string;
  detail: string;
  progress: number;
}) => void;

export interface AgentToolDef {
  definition: Anthropic.Tool;
  handler: (input: unknown, context: AgentContext) => Promise<string>;
}

export interface AgentContext {
  userId: string;
  projectId?: string;
  locale: string;
  provider: string;
  apiKey: string;
  model: string;
  onProgress: ProgressCallback;
  /** Shared mutable state across tool calls within a single run */
  data: Record<string, unknown>;
}

export interface AgentResult {
  success: boolean;
  summary: string;
  data: Record<string, unknown>;
}

export interface AgentRunnerConfig {
  systemPrompt: string;
  tools: AgentToolDef[];
  maxIterations?: number; // default 10
  /** Used as suffix in usage-log action: ai_agent_<agentName>_iter */
  agentName?: string;
}

// ─── Provider helpers ────────────────────────────────────────────

/**
 * Get Anthropic-compatible base URL for a provider.
 * Only providers with Anthropic Messages protocol support can be used.
 */
export function getBaseUrl(provider: string): string | undefined {
  switch (provider) {
    case 'claude': return undefined; // default Anthropic API
    case 'zhipu': return 'https://open.bigmodel.cn/api/anthropic';
    case 'kimi': return 'https://api.moonshot.cn/anthropic';
    case 'minimax': return 'https://api.minimax.chat/anthropic';
    default: return undefined;
  }
}

/** Providers that support Anthropic Messages protocol */
const ANTHROPIC_COMPATIBLE_PROVIDERS = new Set(['claude', 'zhipu', 'kimi', 'minimax']);

export function isAnthropicCompatible(provider: string): boolean {
  return ANTHROPIC_COMPATIBLE_PROVIDERS.has(provider);
}

// ─── Agent Loop ──────────────────────────────────────────────────

export async function runAgentLoop(
  config: AgentRunnerConfig,
  context: AgentContext,
  userMessage: string
): Promise<AgentResult> {
  const baseUrl = getBaseUrl(context.provider);

  const client = new Anthropic({
    apiKey: context.apiKey,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  });

  const maxIterations = config.maxIterations ?? 10;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  // Build tool definitions array
  const toolDefs = config.tools.map((t) => t.definition);

  // Build handler lookup
  const handlerMap = new Map<string, AgentToolDef['handler']>();
  for (const t of config.tools) {
    handlerMap.set(t.definition.name, t.handler);
  }

  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    let response: Anthropic.Message;
    const callStartedAt = Date.now();
    const action = `ai_agent_${config.agentName || 'iter'}`;
    try {
      const aiCall = client.messages.create({
        model: context.model,
        max_tokens: 4096,
        system: config.systemPrompt,
        tools: toolDefs,
        messages,
      });

      // 60s timeout per AI call to avoid indefinite hangs
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI call timed out after 60s')), 60000)
      );

      response = await Promise.race([aiCall, timeout]);

      void logTrackedCall({
        userId: context.userId,
        action,
        provider: context.provider,
        model: response.model || context.model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        durationMs: Date.now() - callStartedAt,
        status: 'success',
      });
    } catch (apiErr) {
      // Extract detailed error from Anthropic SDK
      const errMsg = apiErr instanceof Error ? apiErr.message : String(apiErr);
      const statusCode = (apiErr as { status?: number })?.status;
      console.error(`Agent loop iteration ${iterations} failed:`, errMsg, `(status: ${statusCode}, provider: ${context.provider}, model: ${context.model})`);
      void logTrackedCall({
        userId: context.userId,
        action,
        provider: context.provider,
        model: context.model,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - callStartedAt,
        status: 'failure',
        errorMsg: errMsg,
      });
      throw new Error(`AI API error (${context.provider}/${context.model}): ${errMsg}`);
    }

    // Check if we're done (no more tool calls)
    console.log(`[Agent] iteration=${iterations} stop_reason=${response.stop_reason} content_types=${response.content.map(b => b.type).join(',')}`);

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      const text = textBlock ? (textBlock as Anthropic.TextBlock).text : '';
      console.log(`[Agent] end_turn iter=${iterations} has_report=${!!context.data.report} text_len=${text.length}`);

      // Try to parse JSON report from text response (for models that respond with text instead of tool_use)
      if (!context.data.report && text) {
        const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*"topPros"[\s\S]*"topCons"[\s\S]*\})/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1].trim());
            if (parsed.topPros || parsed.topCons || parsed.summary) {
              context.data.report = { ...parsed, sources: context.data.sources || [] };
              console.log(`[Agent] Parsed JSON report from text: pros=${parsed.topPros?.length || 0} cons=${parsed.topCons?.length || 0}`);
            }
          } catch (e) {
            console.warn('[Agent] Failed to parse JSON from text response:', (e as Error).message);
          }
        }
      }

      return {
        success: true,
        summary: text || 'Completed.',
        data: { ...context.data },
      };
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter(
      (b) => b.type === 'tool_use'
    ) as Anthropic.ToolUseBlock[];

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find((b) => b.type === 'text');
      return {
        success: true,
        summary: textBlock ? (textBlock as Anthropic.TextBlock).text : 'Completed.',
        data: { ...context.data },
      };
    }

    // Add assistant message with all content blocks
    messages.push({ role: 'assistant', content: response.content });

    // Execute each tool and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      let result: string;
      const handler = handlerMap.get(toolUse.name);

      if (!handler) {
        result = JSON.stringify({ error: `Unknown tool: ${toolUse.name}` });
      } else {
        try {
          result = await handler(toolUse.input, context);
        } catch (err) {
          result = JSON.stringify({
            error: err instanceof Error ? err.message : 'Tool execution failed',
          });
        }
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Add tool results back to messages
    messages.push({ role: 'user', content: toolResults });
  }

  return {
    success: false,
    summary: 'Agent reached maximum iterations without completing.',
    data: { ...context.data },
  };
}
