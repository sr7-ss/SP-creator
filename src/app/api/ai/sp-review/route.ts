import { NextRequest, NextResponse } from 'next/server';
import { callTracked } from '@/lib/ai/track-call';
import { getSpReviewSystemPrompt, getSpReviewUserPrompt } from '@/lib/ai/prompts/sp-review';
import { AIProvider } from '@/types';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const {
      spItems,
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

    if (!spItems || !Array.isArray(spItems) || spItems.length === 0) {
      return NextResponse.json(
        { error: zh ? '请先完成卖点分级' : 'SP items are required. Complete tiering first.' },
        { status: 400 }
      );
    }

    const systemPrompt = getSpReviewSystemPrompt(locale);
    const userPrompt = getSpReviewUserPrompt(spItems, productName || 'Product', segment, locale);

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
    console.error('[SP Review] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate review' },
      { status: 500 }
    );
  }
}
