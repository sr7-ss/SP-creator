/**
 * Single entry-point for non-streaming AI calls.
 *
 * Replaces the old pattern of `provider.chat(...)` followed by a separate
 * `logUsage(...)` call. Records token counts, duration, and success/failure
 * in one place so the admin dashboard can be trusted.
 */

import { getAIProvider, type AIMessage, type AIResponse, type ProviderOptions } from '@/lib/ai/provider';
import { logUsage } from '@/lib/ai/usage-logger';
import type { AIProvider } from '@/types';

export interface TrackedCallArgs {
  userId: string;
  action: string;            // e.g. 'ai_packaging' — recorded as UsageLog.action
  provider: AIProvider;
  apiKey: string;
  model?: string;
  messages: AIMessage[];
  temperature?: number;
  /** Output token limit. Defaults to provider default (4096). */
  maxTokens?: number;
  /** Mark system prompt as cacheable (Claude only; ignored elsewhere). */
  cacheSystemPrompt?: boolean;
  providerOptions?: ProviderOptions; // e.g. { browser: true }
  creditsUsed?: number;
}

export async function callTracked(args: TrackedCallArgs): Promise<AIResponse> {
  const adapter = getAIProvider(args.provider, args.apiKey, args.model, args.providerOptions);
  const startedAt = Date.now();
  try {
    const response = await adapter.chat(args.messages, {
      temperature: args.temperature,
      maxTokens: args.maxTokens,
      cacheSystemPrompt: args.cacheSystemPrompt,
    });
    const durationMs = Date.now() - startedAt;
    void logUsage({
      userId: args.userId,
      action: args.action,
      provider: args.provider,
      model: response.model || args.model || 'unknown',
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
      creditsUsed: args.creditsUsed,
      durationMs,
      status: 'success',
    });
    return response;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorMsg = err instanceof Error ? err.message : String(err);
    void logUsage({
      userId: args.userId,
      action: args.action,
      provider: args.provider,
      model: args.model || 'unknown',
      inputTokens: 0,
      outputTokens: 0,
      creditsUsed: 0, // failed calls shouldn't burn credits
      durationMs,
      status: 'failure',
      errorMsg,
    });
    throw err;
  }
}

/**
 * Lightweight variant for callers that already have a raw response object
 * (e.g. the Anthropic SDK Message returned from agent-runner). Lets us record
 * tokens for paths that bypass the `provider.chat()` adapter.
 */
export async function logTrackedCall(args: {
  userId: string;
  action: string;
  provider: AIProvider | string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status?: 'success' | 'failure';
  errorMsg?: string;
}): Promise<void> {
  await logUsage({
    userId: args.userId,
    action: args.action,
    provider: args.provider,
    model: args.model,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    durationMs: args.durationMs,
    status: args.status ?? 'success',
    errorMsg: args.errorMsg,
  });
}
