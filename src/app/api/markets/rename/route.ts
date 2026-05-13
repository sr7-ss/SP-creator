import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const { oldName, newName } = await request.json();

    await prisma.project.updateMany({
      where: { market: oldName, userId },
      data: { market: newName },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    console.error('Failed to rename market:', error);
    return NextResponse.json({ error: 'Failed to rename market' }, { status: 500 });
  }
}
