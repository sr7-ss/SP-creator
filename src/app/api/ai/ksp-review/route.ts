import { NextRequest, NextResponse } from 'next/server';
import { callTracked } from '@/lib/ai/track-call';
import { getKspReviewSystemPrompt, getKspReviewUserPrompt } from '@/lib/ai/prompts/ksp-review';
import { AIProvider } from '@/types';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const {
      kspItems,
      productName,
      segment,
      locale = 'zh',
      aiProvider = 'claude',
      apiKey,
      model,
    } = body;

    const zh = locale === 'zh';

    if (!apiKey) {
      return NextResponse.json(
        { error: zh ? '请先在设置中配置 API Key' : 'API key is required. Please configure it in Settings.' },
        { status: 400 }
      );
    }

    if (!kspItems || !Array.isArray(kspItems) || kspItems.length === 0) {
      return NextResponse.json(
        { error: zh ? '请先完成卖点分级' : 'KSP items are required. Complete tiering first.' },
        { status: 400 }
      );
    }

    const systemPrompt = getKspReviewSystemPrompt(locale);
    const userPrompt = getKspReviewUserPrompt(kspItems, productName || 'Product', segment, locale);

    const result = await callTracked({
      userId,
      action: 'ai_ksp_review',
      provider: aiProvider as AIProvider,
      apiKey,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return NextResponse.json({ review: result.content });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    console.error('[KSP Review] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate review' },
      { status: 500 }
    );
  }
}
