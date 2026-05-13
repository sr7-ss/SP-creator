import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAdmin, handleAdminError } from '@/lib/auth/admin';

const DEFAULT_DAYS = 30;

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '') || DEFAULT_DAYS, 1), 180);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const logs = await prisma.usageLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, name: true } } },
    });

    const successLogs = logs.filter(l => l.status !== 'failure');
    const failureCount = logs.length - successLogs.length;

    const totals = {
      calls: logs.length,
      successCalls: successLogs.length,
      failureCalls: failureCount,
      inputTokens: logs.reduce((s, l) => s + l.inputTokens, 0),
      outputTokens: logs.reduce((s, l) => s + l.outputTokens, 0),
      credits: logs.reduce((s, l) => s + l.creditsUsed, 0),
    };

    // ── By action ──
    const byAction = new Map<string, { calls: number; input: number; output: number; durationSum: number; durationCount: number; failures: number }>();
    for (const l of logs) {
      const cur = byAction.get(l.action) || { calls: 0, input: 0, output: 0, durationSum: 0, durationCount: 0, failures: 0 };
      cur.calls++;
      cur.input += l.inputTokens;
      cur.output += l.outputTokens;
      if (l.durationMs != null) {
        cur.durationSum += l.durationMs;
        cur.durationCount++;
      }
      if (l.status === 'failure') cur.failures++;
      byAction.set(l.action, cur);
    }

    // ── By provider/model ──
    const byProvider = new Map<string, { calls: number; tokens: number; failures: number; durationSum: number; durationCount: number }>();
    for (const l of logs) {
      const key = `${l.provider}/${l.model || 'default'}`;
      const cur = byProvider.get(key) || { calls: 0, tokens: 0, failures: 0, durationSum: 0, durationCount: 0 };
      cur.calls++;
      cur.tokens += l.inputTokens + l.outputTokens;
      if (l.status === 'failure') cur.failures++;
      if (l.durationMs != null) {
        cur.durationSum += l.durationMs;
        cur.durationCount++;
      }
      byProvider.set(key, cur);
    }

    // ── Top users ──
    const byUser = new Map<string, { email: string; calls: number; tokens: number; credits: number }>();
    for (const l of logs) {
      const email = l.user?.email || l.userId;
      const cur = byUser.get(l.userId) || { email, calls: 0, tokens: 0, credits: 0 };
      cur.calls++;
      cur.tokens += l.inputTokens + l.outputTokens;
      cur.credits += l.creditsUsed;
      byUser.set(l.userId, cur);
    }

    // ── Daily trend ──
    const byDay = new Map<string, { calls: number; tokens: number }>();
    for (const l of logs) {
      const d = l.createdAt.toISOString().slice(0, 10);
      const cur = byDay.get(d) || { calls: 0, tokens: 0 };
      cur.calls++;
      cur.tokens += l.inputTokens + l.outputTokens;
      byDay.set(d, cur);
    }

    // ── AI quality signal: average user edit fraction on AI-generated KSP ──
    const editEvents = await prisma.trackEvent.findMany({
      where: { name: 'ai_output_edited', createdAt: { gte: since } },
      select: { props: true },
      take: 5000,
    });
    let l1Sum = 0, l2Sum = 0, l3Sum = 0, n = 0;
    for (const e of editEvents) {
      const p = e.props as { l1Edit?: number; l2Edit?: number; l3Edit?: number } | null;
      if (!p) continue;
      l1Sum += p.l1Edit || 0;
      l2Sum += p.l2Edit || 0;
      l3Sum += p.l3Edit || 0;
      n++;
    }
    const editRate = n > 0
      ? {
          samples: n,
          l1: Math.round((l1Sum / n) * 100),
          l2: Math.round((l2Sum / n) * 100),
          l3: Math.round((l3Sum / n) * 100),
        }
      : { samples: 0, l1: 0, l2: 0, l3: 0 };

    return NextResponse.json({
      days,
      totals,
      byAction: [...byAction.entries()]
        .map(([action, v]) => ({
          action,
          calls: v.calls,
          input: v.input,
          output: v.output,
          total: v.input + v.output,
          avgDurationMs: v.durationCount ? Math.round(v.durationSum / v.durationCount) : null,
          failures: v.failures,
        }))
        .sort((a, b) => b.total - a.total),
      byProvider: [...byProvider.entries()]
        .map(([key, v]) => ({
          key,
          calls: v.calls,
          tokens: v.tokens,
          failureRate: v.calls ? Math.round((v.failures / v.calls) * 100) : 0,
          avgDurationMs: v.durationCount ? Math.round(v.durationSum / v.durationCount) : null,
        }))
        .sort((a, b) => b.tokens - a.tokens),
      topUsers: [...byUser.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 20),
      daily: [...byDay.entries()]
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      editRate,
    });
  } catch (err) {
    const adminRes = handleAdminError(err);
    if (adminRes) return adminRes;
    console.error('admin/usage error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
