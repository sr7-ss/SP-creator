import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuth, handleAuthError } from '@/lib/auth/session';
import { encrypt, decrypt, maskKey } from '@/lib/crypto';

// GET: List user's AI keys (masked)
export async function GET() {
  try {
    const { userId } = await requireAuth();

    const keys = await prisma.userAIKey.findMany({
      where: { userId },
      select: { id: true, provider: true, encryptedKey: true, model: true, updatedAt: true },
    });

    const masked = keys.map(k => ({
      id: k.id,
      provider: k.provider,
      maskedKey: maskKey(decrypt(k.encryptedKey)),
      model: k.model,
      updatedAt: k.updatedAt,
    }));

    return NextResponse.json({ keys: masked });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Failed to fetch keys' }, { status: 500 });
  }
}

// POST: Save/update an AI key
export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const { provider, apiKey, model } = await req.json();

    if (!provider || !apiKey) {
      return NextResponse.json({ error: 'provider and apiKey are required' }, { status: 400 });
    }

    const encryptedKey = encrypt(apiKey);

    await prisma.userAIKey.upsert({
      where: { userId_provider: { userId, provider } },
      update: { encryptedKey, model: model || null },
      create: { userId, provider, encryptedKey, model: model || null },
    });

    return NextResponse.json({ success: true, maskedKey: maskKey(apiKey) });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Failed to save key' }, { status: 500 });
  }
}

// DELETE: Remove an AI key
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider');

    if (!provider) {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 });
    }

    await prisma.userAIKey.deleteMany({
      where: { userId, provider },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Failed to delete key' }, { status: 500 });
  }
}
