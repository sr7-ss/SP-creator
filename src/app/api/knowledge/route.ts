import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

/**
 * GET /api/knowledge?feature=xxx&parentFeature=xxx&entryType=xxx&search=xxx
 * Query knowledge entries with optional filters.
 * Also supports legacy ?category=packaging for backward compat with packaging-core.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const feature = searchParams.get('feature');
    const parentFeature = searchParams.get('parentFeature');
    const entryType = searchParams.get('entryType');
    const search = searchParams.get('search');

    // Query KnowledgeEntry table
    const where: Record<string, unknown> = { userId };
    if (feature) where.feature = feature;
    if (parentFeature) where.parentFeature = parentFeature;
    if (entryType) where.entryType = entryType;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { feature: { contains: search, mode: 'insensitive' } },
      ];
    }

    const entries = await prisma.knowledgeEntry.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(entries);
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    console.error('Failed to fetch knowledge:', error);
    return NextResponse.json({ error: 'Failed to fetch knowledge' }, { status: 500 });
  }
}

/**
 * POST /api/knowledge
 * Create a knowledge entry. Supports both new KnowledgeEntry and legacy Knowledge.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();

    // KnowledgeEntry path
    const { feature, parentFeature, entryType, title, content, brand, sourceUrl, marketingName, structured, tags } = body;
    if (!feature || !entryType) {
      return NextResponse.json(
        { error: 'feature and entryType are required' },
        { status: 400 }
      );
    }

    // brand_name entries: require marketingName instead of title/content
    // (title/content fall back to marketingName so list-display still works)
    if (entryType === 'brand_name') {
      if (!marketingName) {
        return NextResponse.json(
          { error: 'marketingName is required for brand_name entries' },
          { status: 400 }
        );
      }
    } else if (!title || !content) {
      return NextResponse.json(
        { error: 'title and content are required' },
        { status: 400 }
      );
    }

    const entry = await prisma.knowledgeEntry.create({
      data: {
        userId,
        feature,
        parentFeature: parentFeature || null,
        entryType,
        title: title || marketingName || '',
        content: content || '',
        brand: brand || null,
        sourceUrl: sourceUrl || null,
        marketingName: marketingName || null,
        structured: structured || null,
        tags: tags || null,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    console.error('Failed to create knowledge:', error);
    return NextResponse.json({ error: 'Failed to create knowledge' }, { status: 500 });
  }
}

/** PUT /api/knowledge — update a KnowledgeEntry */
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const existing = await prisma.knowledgeEntry.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    const entry = await prisma.knowledgeEntry.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json(entry);
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Failed to update knowledge' }, { status: 500 });
  }
}

/** DELETE /api/knowledge?id=xxx */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    {
      const existing = await prisma.knowledgeEntry.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      }
      await prisma.knowledgeEntry.delete({ where: { id } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Failed to delete knowledge' }, { status: 500 });
  }
}
