/**
 * Research Reports API
 * GET  — list reports for a project (or all user reports)
 * POST — save a new research report
 */
import { NextRequest } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const projectId = req.nextUrl.searchParams.get('projectId');

    const where: Record<string, unknown> = { userId };
    if (projectId) where.projectId = projectId;

    const reports = await prisma.researchReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, name: true, segment: true, market: true } },
      },
    });

    return Response.json({ reports });
  } catch (error) {
    const res = handleAuthError(error);
    if (res) return res;
    return Response.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await req.json();

    const { projectId, query, report } = body as {
      projectId: string;
      query: string;
      report: {
        summary: string;
        topPros?: unknown[];
        topCons?: unknown[];
        userInsights?: unknown[]; // legacy
        competitorMessaging?: unknown[];
        kspRecommendations?: string[];
        sources?: unknown[];
      };
    };

    if (!projectId || !query || !report?.summary) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify project belongs to user
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const saved = await prisma.researchReport.create({
      data: {
        projectId,
        userId,
        query,
        summary: report.summary,
        // Store topPros/topCons in insights JSON field (new format), fallback to legacy userInsights
        insights: { topPros: report.topPros ?? [], topCons: report.topCons ?? [], legacy: report.userInsights ?? [] } as unknown as undefined,
        messaging: (report.competitorMessaging as unknown) ?? [],
        recommendations: (report.kspRecommendations as unknown) ?? [],
        sources: (report.sources as unknown) ?? [],
      },
    });

    return Response.json({ id: saved.id });
  } catch (error) {
    const res = handleAuthError(error);
    if (res) return res;
    return Response.json({ error: 'Failed to save report' }, { status: 500 });
  }
}
