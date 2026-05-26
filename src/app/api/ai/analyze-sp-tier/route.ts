import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { analyzeAndTier } from '@/lib/analysis/rule-engine';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

/**
 * POST /api/ai/analyze-sp-tier
 *
 * Rule-based competitive analysis + SP tiering.
 * No AI calls — uses deterministic param comparison and scoring matrix.
 * Output format is fully compatible with the previous AI-based implementation.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const {
      projectId,
      ownProduct,
      competitors,
      locale = 'zh',
    } = body;
    const zh = locale === 'zh';

    if (!ownProduct || !competitors || competitors.length === 0) {
      return NextResponse.json(
        { error: zh ? '需要自家产品和至少一个竞品' : 'Own product and at least one competitor are required.' },
        { status: 400 }
      );
    }

    // Verify project ownership if projectId is provided
    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId, userId } });
      if (!project) {
        return NextResponse.json({ error: zh ? '项目不存在' : 'Project not found' }, { status: 404 });
      }
    }

    // Run rule-based analysis + tiering (no AI needed)
    const { analysis, spItems } = analyzeAndTier(
      ownProduct,
      competitors,
      locale
    );

    // Persist to DB
    if (projectId) {
      try {
        await prisma.analysis.deleteMany({ where: { projectId } });
        await prisma.analysis.create({
          data: {
            projectId,
            result: JSON.parse(JSON.stringify(analysis)),
          },
        });

        await prisma.spResult.deleteMany({ where: { projectId } });
        if (spItems.length > 0) {
          await prisma.spResult.createMany({
            data: spItems.map((item, idx) => ({
              projectId,
              tier: item.tier,
              featureName: item.featureName,
              paramValue: item.paramValue || '',
              leadLevel: item.leadLevel || null,
              sortOrder: idx,
            })),
          });
        }
      } catch (err) {
        console.error('[analyze-sp-tier] Failed to persist results:', err);
      }
    }

    return NextResponse.json({ analysis, spItems });
  } catch (error: unknown) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[analyze-sp-tier] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
