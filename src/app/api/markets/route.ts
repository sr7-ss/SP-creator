import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

export async function GET() {
  try {
    const { userId } = await requireAuth();

    const projects = await prisma.project.findMany({
      select: { market: true },
      where: { market: { not: null }, userId },
    });

    // Get unique markets with project count
    const marketCounts = new Map<string, number>();
    projects.forEach((p) => {
      if (p.market) {
        marketCounts.set(p.market, (marketCounts.get(p.market) || 0) + 1);
      }
    });

    const markets = Array.from(marketCounts.entries()).map(([name, count]) => ({
      name,
      projectCount: count,
    }));

    return NextResponse.json(markets);
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    console.error('Failed to fetch markets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch markets' },
      { status: 500 }
    );
  }
}
