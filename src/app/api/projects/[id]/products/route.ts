import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuth, handleAuthError } from '@/lib/auth/session';
import { normalizeAllParams } from '@/lib/analysis/spec-scraper';

export async function POST(
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
    const { id, name, isOwnProduct, params: productParams } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Product id is required' },
        { status: 400 }
      );
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Product name is required' },
        { status: 400 }
      );
    }

    // Normalize param separators (comma → " / ") for consistency
    const normalizedParams = productParams ? normalizeAllParams(productParams) : {};

    // Upsert by client-provided id so the frontend can autosave via POST
    // without creating duplicate products.
    const product = await prisma.product.upsert({
      where: { id },
      update: {
        name,
        isOwnProduct: isOwnProduct ?? false,
        params: normalizedParams,
      },
      create: {
        id,
        projectId,
        name,
        isOwnProduct: isOwnProduct ?? false,
        params: normalizedParams,
      },
    });

    return NextResponse.json(product, { status: 200 });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    console.error('Failed to create product:', error);
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/[id]/products
 * Replace ALL products for a project atomically (delete old + create new).
 * Body: { products: Array<{ id, name, isOwnProduct, params, sortOrder? }> }
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
    const { products } = body as {
      products: Array<{
        id: string;
        name: string;
        isOwnProduct: boolean;
        params: Record<string, string>;
        sourceUrl?: string;
        sortOrder?: number;
      }>;
    };

    if (!Array.isArray(products)) {
      return NextResponse.json({ error: 'products array is required' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.product.deleteMany({ where: { projectId } }),
      prisma.product.createMany({
        data: products.map((p, idx) => ({
          id: p.id,
          projectId,
          name: p.name,
          isOwnProduct: p.isOwnProduct ?? false,
          params: p.params ? normalizeAllParams(p.params) : {},
          sourceUrl: p.sourceUrl || null,
          sortOrder: p.sortOrder ?? idx,
        })),
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    console.error('Failed to replace products:', error);
    return NextResponse.json({ error: 'Failed to replace products' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Product id is required as query param' },
        { status: 400 }
      );
    }

    // Verify the product belongs to a project owned by this user
    const product = await prisma.product.findUnique({
      where: { id },
      include: { project: { select: { userId: true } } },
    });
    if (!product || product.project.userId !== userId) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    await prisma.product.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    console.error('Failed to delete product:', error);
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    );
  }
}
