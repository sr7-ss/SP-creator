import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

/** GET /api/templates — list all templates for current user */
export async function GET() {
  try {
    const { userId } = await requireAuth();
    const templates = await prisma.sellingPointTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(templates);
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

/** POST /api/templates — create a new template */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const { matchFeatures, parentName, parentSlogan, subFeatures } = await request.json();

    if (!matchFeatures?.length || !parentName || !subFeatures?.length) {
      return NextResponse.json(
        { error: 'matchFeatures, parentName, and subFeatures are required' },
        { status: 400 }
      );
    }

    const template = await prisma.sellingPointTemplate.create({
      data: {
        userId,
        matchFeatures,
        parentName,
        parentSlogan: parentSlogan || null,
        subFeatures,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}

/** PUT /api/templates — update a template */
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const { id, matchFeatures, parentName, parentSlogan, subFeatures } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await prisma.sellingPointTemplate.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const template = await prisma.sellingPointTemplate.update({
      where: { id },
      data: {
        ...(matchFeatures !== undefined && { matchFeatures }),
        ...(parentName !== undefined && { parentName }),
        ...(parentSlogan !== undefined && { parentSlogan }),
        ...(subFeatures !== undefined && { subFeatures }),
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

/** DELETE /api/templates?id=xxx */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const existing = await prisma.sellingPointTemplate.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await prisma.sellingPointTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
