/**
 * POST /api/projects/[id]/reset
 * Clears all derived data for a project:
 *   - Competitor products (non-own)
 *   - Analysis records
 *   - SP results
 * Keeps the project itself and the own product.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;

    // Verify ownership
    const project = await prisma.project.findUnique({
      where: { id, userId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Delete in order: SP results → Analysis → Competitor products
    await prisma.$transaction([
      prisma.spResult.deleteMany({ where: { projectId: id } }),
      prisma.analysis.deleteMany({ where: { projectId: id } }),
      prisma.product.deleteMany({ where: { projectId: id, isOwnProduct: false } }),
    ]);

    // Also clear own product params so agent/manual can re-fetch
    await prisma.product.updateMany({
      where: { projectId: id, isOwnProduct: true },
      data: { params: '{}' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    console.error('Failed to reset project:', error);
    return NextResponse.json(
      { error: 'Failed to reset project' },
      { status: 500 }
    );
  }
}
