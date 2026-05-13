import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

/**
 * PUT /api/projects/[id]/ksp-results
 * Replace all KSP results for a project (used after drag-reorder or manual edits).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth();
    const { id: projectId } = await params;

    // Verify project ownership
    const project = await prisma.project.findUnique({ where: { id: projectId, userId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await request.json();
    const { items } = body as {
      items: Array<{
        tier: number;
        featureName: string;
        paramValue?: string;
        leadLevel?: string;
        l1Name?: string;
        l2Slogan?: string;
        l2SloganType?: string;
        l2Alternatives?: unknown;
        l3Details?: unknown;
        sortOrder?: number;
      }>;
    };

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 });
    }

    // Replace all KSP results in a transaction
    await prisma.$transaction([
      prisma.kspResult.deleteMany({ where: { projectId } }),
      prisma.kspResult.createMany({
        data: items.map((item, idx) => ({
          projectId,
          tier: item.tier,
          featureName: item.featureName,
          paramValue: item.paramValue || '',
          leadLevel: item.leadLevel || null,
          l1Name: item.l1Name || null,
          l2Slogan: item.l2Slogan || null,
          l2SloganType: item.l2SloganType || null,
          l2Alternatives: item.l2Alternatives ? JSON.parse(JSON.stringify(item.l2Alternatives)) : undefined,
          l3Details: item.l3Details ? JSON.parse(JSON.stringify(item.l3Details)) : undefined,
          sortOrder: item.sortOrder ?? idx,
        })),
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    console.error('Failed to save KSP results:', error);
    return NextResponse.json({ error: 'Failed to save KSP results' }, { status: 500 });
  }
}
