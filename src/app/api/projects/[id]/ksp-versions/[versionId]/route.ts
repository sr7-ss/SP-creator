import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

// GET: Get a single version with full snapshot
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { userId } = await requireAuth();
    const { id: projectId, versionId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const version = await prisma.kspVersion.findFirst({
      where: { id: versionId, projectId },
    });
    if (!version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    return NextResponse.json({ version });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH: Update version name
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { userId } = await requireAuth();
    const { id: projectId, versionId } = await params;
    const { name } = await req.json();

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const version = await prisma.kspVersion.update({
      where: { id: versionId },
      data: { name },
    });

    return NextResponse.json({ version });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: Delete a version
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { userId } = await requireAuth();
    const { id: projectId, versionId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    await prisma.kspVersion.delete({
      where: { id: versionId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
