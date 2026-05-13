import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAdmin, handleAdminError } from '@/lib/auth/admin';

const DEFAULT_DAYS = 30;

const FUNNEL_STEPS = [
  'page_view',
  'project_created',
  'ai_packaging_started',
  'ai_packaging_succeeded',
  'export_completed',
];

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '') || DEFAULT_DAYS, 1), 180);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const events = await prisma.trackEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    // Total events + unique users + sessions
    const uniqueUsers = new Set<string>();
    const uniqueSessions = new Set<string>();
    for (const e of events) {
      if (e.userId) uniqueUsers.add(e.userId);
      uniqueSessions.add(e.sessionId);
    }

    // Top events by name
    const byName = new Map<string, { count: number; users: Set<string> }>();
    for (const e of events) {
      const cur = byName.get(e.name) || { count: 0, users: new Set<string>() };
      cur.count++;
      if (e.userId) cur.users.add(e.userId);
      byName.set(e.name, cur);
    }

    // Funnel: count distinct sessions reaching each step
    const funnel = FUNNEL_STEPS.map(step => {
      const sessions = new Set<string>();
      for (const e of events) {
        if (e.name === step) sessions.add(e.sessionId);
      }
      return { step, sessions: sessions.size };
    });

    // DAU trend
    const byDay = new Map<string, Set<string>>();
    for (const e of events) {
      const d = e.createdAt.toISOString().slice(0, 10);
      const set = byDay.get(d) || new Set<string>();
      if (e.userId) set.add(e.userId);
      else set.add(e.sessionId); // count anonymous by session
      byDay.set(d, set);
    }

    // Recent events
    const recent = events.slice(0, 50).map(e => ({
      name: e.name,
      path: e.path,
      sessionId: e.sessionId,
      props: e.props,
      createdAt: e.createdAt,
    }));

    return NextResponse.json({
      days,
      totals: {
        events: events.length,
        users: uniqueUsers.size,
        sessions: uniqueSessions.size,
      },
      funnel,
      byName: [...byName.entries()]
        .map(([name, v]) => ({ name, count: v.count, users: v.users.size }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30),
      daily: [...byDay.entries()]
        .map(([date, set]) => ({ date, dau: set.size }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      recent,
    });
  } catch (err) {
    const adminRes = handleAdminError(err);
    if (adminRes) return adminRes;
    console.error('admin/events error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
