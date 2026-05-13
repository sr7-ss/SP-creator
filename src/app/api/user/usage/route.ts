import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth();

    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const [logs, total] = await Promise.all([
      prisma.usageLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.usageLog.count({ where: { userId } }),
    ]);

    // Aggregate stats
    const stats = await prisma.usageLog.aggregate({
      where: { userId },
      _sum: { inputTokens: true, outputTokens: true, creditsUsed: true },
      _count: true,
    });

    return NextResponse.json({
      logs,
      total,
      stats: {
        totalCalls: stats._count,
        totalInputTokens: stats._sum.inputTokens ?? 0,
        totalOutputTokens: stats._sum.outputTokens ?? 0,
        totalCreditsUsed: stats._sum.creditsUsed ?? 0,
      },
    });
  } catch (error) {
    const res = handleAuthError(error);
    return res || NextResponse.json({ error: 'Failed to fetch usage' }, { status: 500 });
  }
}
