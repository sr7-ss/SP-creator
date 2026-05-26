import { prisma } from '@/lib/db/client';

/**
 * Log an AI API call to the UsageLog table.
 * Call this after every AI invocation (success or failure).
 */
export async function logUsage(params: {
  userId: string;
  action: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  creditsUsed?: number;
  durationMs?: number;
  status?: 'success' | 'failure';
  errorMsg?: string;
}) {
  try {
    await prisma.usageLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        provider: params.provider,
        model: params.model,
        inputTokens: params.inputTokens ?? 0,
        outputTokens: params.outputTokens ?? 0,
        creditsUsed: params.creditsUsed ?? 1,
        durationMs: params.durationMs,
        status: params.status ?? 'success',
        errorMsg: params.errorMsg ? params.errorMsg.slice(0, 500) : null,
      },
    });
  } catch (err) {
    // Don't fail the main request if logging fails
    console.error('Failed to log usage:', err);
  }
}

/** Human-readable action names */
export const ACTION_LABELS: Record<string, { en: string; zh: string }> = {
  ai_parse_params: { en: 'Param Recognition', zh: '参数识别' },
  ai_analyze: { en: 'Competitive Analysis', zh: '竞品分析' },
  ai_ksp_tier: { en: 'SP Grading', zh: '卖点分级' },
  ai_packaging: { en: 'Selling Point Packaging', zh: '卖点包装' },
  ai_agent: { en: 'Agent Mode', zh: 'Agent 模式' },
  ai_review_analysis: { en: 'Review Analysis', zh: '评论分析' },
  ai_agent_orchestration: { en: 'Agent Orchestration', zh: 'Agent 编排' },
  ai_agent_packaging: { en: 'Agent Packaging', zh: 'Agent 包装' },
};
