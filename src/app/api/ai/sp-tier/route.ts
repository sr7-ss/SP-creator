import { NextRequest, NextResponse } from 'next/server';
import { callTracked } from '@/lib/ai/track-call';
import { getSpTierSystemPrompt, getSpTierUserPrompt } from '@/lib/ai/prompts/sp-tier';
import { AIProvider } from '@/types';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const {
      analysisResult,
      ownProductName,
      segment,
      locale = 'en',
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

    if (!analysisResult) {
      return NextResponse.json(
        { error: zh ? '请先运行竞品分析' : 'Analysis result is required. Run competitive analysis first.' },
        { status: 400 }
      );
    }

    const systemPrompt = getSpTierSystemPrompt(locale);
    const userPrompt = getSpTierUserPrompt(
      JSON.stringify(analysisResult),
      ownProductName,
      segment
    );

    const extractJson = (raw: string): string => {
      const cleaned = raw
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Be resilient to the model adding extra text.
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start >= 0 && end >= 0 && end > start) return cleaned.slice(start, end + 1);
      return cleaned;
    };

    const normalizeTier = (tier: unknown): 1 | 2 | 3 | undefined => {
      if (tier === 1 || tier === 2 || tier === 3) return tier;
      if (typeof tier === 'number' && (tier === 1 || tier === 2 || tier === 3)) return tier as 1 | 2 | 3;
      if (typeof tier === 'string') {
        const m = tier.toUpperCase().match(/[123]/);
        if (!m) return undefined;
        const n = Number(m[0]);
        if (n === 1 || n === 2 || n === 3) return n as 1 | 2 | 3;
      }
      return undefined;
    };

    type UnknownRecord = Record<string, unknown>;
    const normalizeSpItems = (
      raw: unknown
    ): { tier: 1 | 2 | 3; featureName: string; paramValue: string; reasoning?: string }[] => {
      const rawObj: UnknownRecord =
        raw && typeof raw === 'object' ? (raw as UnknownRecord) : {};

      const spItemsVal = rawObj['spItems'];
      const fromArray: unknown[] = Array.isArray(spItemsVal) ? spItemsVal : [];

      // Fallback shapes (some models may output tier1/tier2/tier3).
      const tier1Val = rawObj['tier1'] ?? rawObj['T1'];
      const tier2Val = rawObj['tier2'] ?? rawObj['T2'];
      const tier3Val = rawObj['tier3'] ?? rawObj['T3'];

      const fromTiers: unknown[] = [
        ...(Array.isArray(tier1Val) ? tier1Val : []),
        ...(Array.isArray(tier2Val) ? tier2Val : []),
        ...(Array.isArray(tier3Val) ? tier3Val : []),
      ];

      const candidates = fromArray.length > 0 ? fromArray : fromTiers;

      type SpItem = { tier: 1 | 2 | 3; featureName: string; paramValue: string; reasoning?: string };
      const mapped = candidates.map((candidate) => {
          const itemObj: UnknownRecord =
            candidate && typeof candidate === 'object' ? (candidate as UnknownRecord) : {};

          const tier = normalizeTier(itemObj['tier']);
          const featureName = String(
            itemObj['featureName'] ??
              itemObj['feature'] ??
              itemObj['parameter'] ??
              itemObj['name'] ??
              ''
          ).trim();

          if (!tier || !featureName) return null;

          const paramValue = String(
            itemObj['paramValue'] ?? itemObj['param_value'] ?? itemObj['value'] ?? ''
          ).trim();

          const reasoning = typeof itemObj['reasoning'] === 'string' ? itemObj['reasoning'] : undefined;
          return { tier, featureName, paramValue, reasoning } as SpItem;
        });
      return mapped.filter(
          (x): x is SpItem => x !== null
        );
    };

    const generateOnce = async (extraInstruction?: string, action: string = 'ai_ksp_tier') => {
      const response = await callTracked({
        userId,
        action,
        provider: aiProvider as AIProvider,
        apiKey,
        model,
        cacheSystemPrompt: true,   // sp-tier system prompt is reused across regenerations
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: extraInstruction ? `${userPrompt}\n\n${extraInstruction}` : userPrompt,
          },
        ],
      });

      try {
        const jsonText = extractJson(response.content);
        const parsed: unknown = JSON.parse(jsonText);
        return normalizeSpItems(parsed);
      } catch {
        return null;
      }
    };

    const hasAllTiers = (items: { tier: 1 | 2 | 3 }[]) => {
      const tiers = new Set(items.map((i) => i.tier));
      return tiers.has(1) && tiers.has(2) && tiers.has(3);
    };

    const first = await generateOnce();
    if (first && hasAllTiers(first)) {
      return NextResponse.json({ spItems: first });
    }

    // Retry once if the model missed one or more tiers.
    const retryInstruction =
      'IMPORTANT: Your last response did not include at least one item for each tier (T1, T2, T3). ' +
      'Regenerate the JSON again. Ensure T1/T2/T3 each has at least one item. Output JSON only.';
    const second = await generateOnce(retryInstruction, 'ai_ksp_tier_retry');

    if (second) {
      return NextResponse.json({ spItems: second });
    }

    return NextResponse.json(
      { error: zh ? 'AI 返回格式异常，请重试' : 'Failed to parse AI response for sp-tier generation' },
      { status: 500 }
    );
  } catch (error: unknown) {
    const res = handleAuthError(error);
    if (res) return res;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
