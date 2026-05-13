import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const { name } = await request.json();

    await prisma.project.deleteMany({
      where: { market: name, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    console.error('Failed to delete market:', error);
    return NextResponse.json({ error: 'Failed to delete market' }, { status: 500 });
  }
}
