import { NextRequest, NextResponse } from 'next/server';
import { AIProvider } from '@/types';
import { prisma } from '@/lib/db/client';
import { requireAuth, handleAuthError } from '@/lib/auth/session';
import { decrypt } from '@/lib/crypto';
import { runPackaging } from '@/lib/ai/packaging-core';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const {
      spItems,
      productName,
      segment,
      competitorContext,
      positioning,
      packagingStrategy,
      projectId,
      locale = 'en',
      aiProvider = 'claude',
      model,
      refinementPrompt,
      currentPackaging,
    } = body;
    const zh = locale === 'zh';

    // Get API key: DB first, fall back to request body
    let apiKey = '';
    const userKey = await prisma.userAIKey.findUnique({
      where: { userId_provider: { userId, provider: aiProvider } },
    });
    if (userKey) {
      apiKey = decrypt(userKey.encryptedKey);
    } else if (body.apiKey) {
      apiKey = body.apiKey;
    }

    // Resolve packaging strategy: explicit body value wins; otherwise read from Project.
    let resolvedStrategy: string | undefined = packagingStrategy || undefined;
    if (!resolvedStrategy && projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { packagingStrategy: true },
      });
      resolvedStrategy = project?.packagingStrategy || undefined;
    }

    const result = await runPackaging({
      spItems,
      productName,
      segment: segment || '',
      competitorContext: competitorContext || '',
      positioning: positioning || undefined,
      researchContext: body.researchContext || undefined,
      packagingStrategy: resolvedStrategy,
      locale,
      userId,
      provider: aiProvider as AIProvider,
      apiKey,
      model: model || '',
      deductCredit: true,
      logAction: 'ai_packaging',
      refinementPrompt: refinementPrompt || undefined,
      currentPackaging: currentPackaging || undefined,
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
