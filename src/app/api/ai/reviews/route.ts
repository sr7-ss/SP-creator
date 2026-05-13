import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/session';
import { callTracked } from '@/lib/ai/track-call';
import { getReviewAnalysisSystemPrompt, getReviewAnalysisUserPrompt } from '@/lib/ai/prompts/review-analysis';
import { safeJsonParse } from '@/lib/ai/packaging-core';
import { prisma } from '@/lib/db/client';
import { decrypt } from '@/lib/crypto';
import { checkAndDeductCredit } from '@/lib/auth/credits';
import { AIProvider, ReviewSentiment } from '@/types';

const VALID_SENTIMENTS = new Set(['positive', 'negative', 'neutral']);
const BATCH_SIZE = 30;

function normalizeSentiment(s: unknown): ReviewSentiment {
  const str = String(s || '').toLowerCase();
  return VALID_SENTIMENTS.has(str) ? str as ReviewSentiment : 'neutral';
}

function normalizeScore(s: unknown): number {
  const n = Number(s);
  if (isNaN(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function normalizeReviewItem(raw: unknown, originalText: string) {
  const p = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    text: originalText,
    sentiment: normalizeSentiment(p['sentiment']),
    score: normalizeScore(p['score']),
    dimensions: Array.isArray(p['dimensions']) ? (p['dimensions'] as string[]).map(String) : [],
    highlights: Array.isArray(p['highlights']) ? (p['highlights'] as string[]).map(String) : [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const {
      projectId,
      reviews,
      productName,
      fileName = 'upload.csv',
      locale = 'en',
      aiProvider = 'claude',
      model,
    } = body;
    const zh = locale === 'zh';

    if (!projectId || !Array.isArray(reviews) || reviews.length === 0) {
      return NextResponse.json(
        { error: zh ? '请上传包含评论的文件' : 'Reviews array is required.' },
        { status: 400 }
      );
    }

    // Cap at 500 reviews
    const reviewTexts: string[] = reviews.slice(0, 500).map(String);

    // Credit check
    const creditCheck = await checkAndDeductCredit(userId, 'ai_review_analysis', aiProvider, model || '');
    if (!creditCheck.ok) {
      return NextResponse.json({ error: creditCheck.error }, { status: 403 });
    }

    // Resolve API key
    let apiKey = '';
    const userKey = await prisma.userAIKey.findUnique({
      where: { userId_provider: { userId, provider: aiProvider } },
    });
    if (userKey) {
      apiKey = decrypt(userKey.encryptedKey);
    } else if (body.apiKey) {
      apiKey = body.apiKey;
    }
    if (!apiKey) {
      return NextResponse.json(
        { error: zh ? '请先在设置中配置 API Key' : 'API key is required.' },
        { status: 400 }
      );
    }

    const systemPrompt = getReviewAnalysisSystemPrompt(locale);

    // Create batch record
    const batch = await prisma.reviewBatch.create({
      data: {
        projectId,
        fileName,
        totalCount: reviewTexts.length,
        status: 'processing',
      },
    });

    // Process in batches
    const allResults: ReturnType<typeof normalizeReviewItem>[] = [];
    const chunks: string[][] = [];
    for (let i = 0; i < reviewTexts.length; i += BATCH_SIZE) {
      chunks.push(reviewTexts.slice(i, i + BATCH_SIZE));
    }

    for (const chunk of chunks) {
      try {
        const userPrompt = getReviewAnalysisUserPrompt(chunk, productName);
        const response = await callTracked({
          userId,
          action: 'ai_review_analysis',
          provider: aiProvider as AIProvider,
          apiKey,
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });

        const parsed = safeJsonParse(response.content);
        const arr = Array.isArray(parsed) ? parsed : [];

        for (let i = 0; i < chunk.length; i++) {
          allResults.push(normalizeReviewItem(arr[i], chunk[i]));
        }
      } catch (err) {
        console.error('[reviews] Batch analysis failed:', err);
        // Fill with neutral defaults for failed batch
        for (const text of chunk) {
          allResults.push({ text, sentiment: 'neutral', score: 0, dimensions: [], highlights: [] });
        }
      }
    }

    // Save items to DB
    for (const item of allResults) {
      await prisma.reviewItem.create({
        data: {
          batchId: batch.id,
          text: item.text,
          sentiment: item.sentiment,
          score: item.score,
          dimensions: item.dimensions,
          highlights: item.highlights,
        },
      });
    }

    // Compute summary
    const summary = {
      positive: allResults.filter(r => r.sentiment === 'positive').length,
      negative: allResults.filter(r => r.sentiment === 'negative').length,
      neutral: allResults.filter(r => r.sentiment === 'neutral').length,
      dimensions: {} as Record<string, number>,
    };
    for (const item of allResults) {
      for (const dim of item.dimensions) {
        summary.dimensions[dim] = (summary.dimensions[dim] || 0) + 1;
      }
    }

    // Update batch
    await prisma.reviewBatch.update({
      where: { id: batch.id },
      data: { status: 'completed', summary },
    });

    return NextResponse.json({
      batchId: batch.id,
      summary,
      items: allResults,
    });
  } catch (error: unknown) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
