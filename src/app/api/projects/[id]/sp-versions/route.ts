import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

// GET: List all SP versions for a project
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth();
    const { id: projectId } = await params;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const versions = await prisma.spVersion.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ versions });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: Save current SP state as a new version
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth();
    const { id: projectId } = await params;
    const { name, spItems } = await req.json();

    if (!name || !spItems) {
      return NextResponse.json({ error: 'name and spItems are required' }, { status: 400 });
    }

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const version = await prisma.spVersion.create({
      data: {
        projectId,
        name,
        snapshot: spItems,
      },
    });

    return NextResponse.json({ version });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
