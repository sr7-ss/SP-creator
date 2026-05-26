/**
 * Rule-based competitive analysis and SP tiering.
 * Replaces two AI calls with deterministic logic.
 * Output format is fully compatible with the existing CompetitiveAnalysis and SpItem types.
 */

import { CompetitiveAnalysis, AnalysisItem } from '@/types';
import { DEFAULT_PARAM_WEIGHTS, CATEGORY_WEIGHT_MAP, getCategoryKey } from '@/lib/constants/param-weights';
import { SOFT_SELLING_POINTS } from '@/lib/constants/soft-selling-points';
import { PARAM_DISPLAY_NAMES, SKIP_COMPARISON_KEYS } from './direction-map';
import {
  extractSubValues,
  compareValues,
  compareQualitative,
  type LeadLevel,
} from './param-parser';

// ─── Step 1: Competitive Analysis ───────────────────────────────

interface ProductInput {
  name: string;
  params: Record<string, string>;
}

/**
 * Compare own product params against competitors.
 * Produces the same CompetitiveAnalysis shape as the AI endpoint.
 */
export function compareParams(
  own: ProductInput,
  competitors: ProductInput[],
  locale: string = 'zh'
): CompetitiveAnalysis {
  const advantages: AnalysisItem[] = [];
  const disadvantages: AnalysisItem[] = [];
  const neutral: AnalysisItem[] = [];

  const zh = locale === 'zh';

  for (const paramKey of Object.keys(own.params)) {
    const ownVal = own.params[paramKey] || '';
    if (!ownVal.trim()) continue;

    // Skip non-comparable params (both legacy and new dot-notation keys)
    // display.size is excluded: screen size alone is not a meaningful selling point
    if (paramKey === 'launch' || paramKey === 'others' || paramKey === 'misc.price' || paramKey === 'display.size' || SKIP_COMPARISON_KEYS.has(paramKey)) continue;

    const competitorValues: Record<string, string> = {};
    for (const comp of competitors) {
      competitorValues[comp.name] = comp.params[paramKey] || '';
    }

    const compVals = competitors.map((c) => c.params[paramKey] || '');
    const displayName = zh
      ? PARAM_DISPLAY_NAMES[paramKey]?.zh || paramKey
      : PARAM_DISPLAY_NAMES[paramKey]?.en || paramKey;

    // Extract numeric sub-values
    const ownSubs = extractSubValues(paramKey, ownVal);

    if (ownSubs.length === 0) {
      // Qualitative comparison
      const lead = compareQualitative(ownVal, compVals);
      const item: AnalysisItem & { _paramKey?: string } = {
        feature: displayName,
        ownValue: ownVal,
        competitorValues,
        assessment: ownVal,
        leadLevel: lead,
        _paramKey: paramKey,
      };
      if (lead === 'neutral') neutral.push(item);
      else if (lead.includes('lead')) advantages.push(item);
      else disadvantages.push(item);
      continue;
    }

    // Numeric comparison: use the most significant sub-value's result
    let bestLead: LeadLevel = 'neutral';
    let bestDiff = 0;
    const assessmentParts: string[] = [];

    for (const ownSub of ownSubs) {
      const compNums: number[] = [];
      for (const compVal of compVals) {
        const compSubs = extractSubValues(paramKey, compVal);
        const matching = compSubs.find((s) => s.label === ownSub.label);
        if (matching) compNums.push(matching.value);
      }

      if (compNums.length === 0) continue;

      let leadLevel: LeadLevel;
      let diffPercent: number;

      if (ownSub.ordinal) {
        // Ordinal comparison: any higher model number is a meaningful lead
        const bestComp = ownSub.direction === 'higher' ? Math.max(...compNums) : Math.min(...compNums);
        const diff = ownSub.direction === 'higher' ? ownSub.value - bestComp : bestComp - ownSub.value;
        diffPercent = bestComp > 0 ? (diff / bestComp) * 100 : 0;
        if (diff > 0) leadLevel = 'slight_lead';
        else if (diff < 0) leadLevel = 'slight_lag';
        else leadLevel = 'neutral';
      } else {
        ({ leadLevel, diffPercent } = compareValues(ownSub.value, compNums, ownSub.direction));
      }

      // Build assessment text
      const bestCompVal = ownSub.direction === 'higher'
        ? Math.max(...compNums)
        : Math.min(...compNums);
      const diffStr = Math.abs(diffPercent).toFixed(0);

      if (zh) {
        assessmentParts.push(`${ownSub.raw} vs ${bestCompVal}${ownSub.raw.replace(/[\d.]+/, '')}, ${diffPercent >= 0 ? '领先' : '落后'}${diffStr}%`);
      } else {
        assessmentParts.push(`${ownSub.raw} vs ${bestCompVal}${ownSub.raw.replace(/[\d.]+/, '')}, ${diffPercent >= 0 ? 'leads' : 'trails'} ${diffStr}%`);
      }

      // Track the strongest lead/lag among sub-values
      const absOld = Math.abs(bestDiff);
      const absNew = Math.abs(diffPercent);
      if (absNew > absOld) {
        bestLead = leadLevel;
        bestDiff = diffPercent;
      }
    }

    const item: AnalysisItem & { _paramKey?: string } = {
      feature: displayName,
      ownValue: ownVal,
      competitorValues,
      assessment: assessmentParts.join('; ') || ownVal,
      leadLevel: bestLead,
      _paramKey: paramKey,
    };

    if (bestLead.includes('lead')) advantages.push(item);
    else if (bestLead === 'neutral') neutral.push(item);
    else disadvantages.push(item);
  }

  return { advantages, disadvantages, neutral };
}

// ─── Step 2: SP Tier Assignment ────────────────────────────────

interface SpItemResult {
  tier: 0 | 1 | 2 | 3;
  featureName: string;
  paramValue: string;
  reasoning?: string;
  leadLevel?: 'strong_lead' | 'slight_lead' | 'neutral' | 'slight_lag' | 'strong_lag';
}

// Map param weight tiers to numeric attention scores (base score)
const ATTENTION_SCORES: Record<number, number> = { 1: 10, 2: 6, 3: 3 };

// Additive bonus based on competitive lead level
const LEAD_BONUS: Record<LeadLevel, number> = {
  strong_lead: 4,
  slight_lead: 2,
  neutral: 0,
  slight_lag: -2,
  strong_lag: -5,
};

/**
 * Map an analysis feature name or param key to attention score.
 * Supports both dot-notation keys (via category prefix) and display names.
 */
function getAttentionScore(feature: string, paramKey?: string): number {
  // Try dot-notation category mapping first
  if (paramKey) {
    const catKey = getCategoryKey(paramKey);
    const tier = CATEGORY_WEIGHT_MAP[catKey];
    if (tier) return ATTENTION_SCORES[tier] ?? 3;
  }

  // Fall back to name matching (legacy + display name matching)
  const fl = feature.toLowerCase();
  for (const w of DEFAULT_PARAM_WEIGHTS) {
    if (
      fl.includes(w.name.toLowerCase()) ||
      fl.includes(w.nameZh)
    ) {
      return ATTENTION_SCORES[w.tier] ?? 3;
    }
  }
  return 3; // default low
}

/**
 * Assign T1/T2/T3 tiers based on analysis results using scoring matrix.
 */
export function assignTiers(analysis: CompetitiveAnalysis): SpItemResult[] {
  // Collect all items with their scores
  const candidates = [
    ...analysis.advantages,
    ...analysis.neutral,
    // Include slight disadvantages too (they could be T3)
    ...analysis.disadvantages.filter((d) =>
      d.leadLevel === 'slight_lag'
    ),
  ];

  // Deduplicate: if multiple params belong to the same category (e.g. platform.chipset + platform.cpu),
  // keep only the one with the strongest lead (highest score). This prevents "处理器" and "芯片" duplicates.
  const categoryBest = new Map<string, { item: AnalysisItem & { _paramKey?: string }; score: number; attention: number }>();

  for (const item of candidates) {
    const pk = (item as AnalysisItem & { _paramKey?: string })._paramKey;
    const attention = getAttentionScore(item.feature, pk);
    const bonus = LEAD_BONUS[item.leadLevel] ?? 0;
    const score = attention + bonus;
    const catKey = pk ? getCategoryKey(pk) : item.feature.toLowerCase();

    const existing = categoryBest.get(catKey);
    if (!existing || score > existing.score) {
      categoryBest.set(catKey, { item: item as AnalysisItem & { _paramKey?: string }, score, attention });
    }
  }

  const scored = Array.from(categoryBest.values());

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Assign tiers
  // Hard rule: T1 candidates MUST be slight_lead or strong_lead — neutral/lag can never be T1
  const results: SpItemResult[] = [];
  let t1Count = 0;
  const t1Max = 3;

  for (const { item, score } of scored) {
    let tier: 1 | 2 | 3;
    const isLeading = item.leadLevel === 'strong_lead' || item.leadLevel === 'slight_lead';

    if (t1Count < t1Max && score >= 10 && isLeading) {
      tier = 1;
      t1Count++;
    } else if (score >= 5) {
      tier = 2;
    } else {
      tier = 3;
    }

    results.push({
      tier,
      featureName: item.feature,
      paramValue: item.ownValue,
      leadLevel: item.leadLevel,
    });
  }

  // Ensure at least 1 item per tier
  const tiers = new Set(results.map((r) => r.tier));
  if (!tiers.has(2) && results.length > 1) {
    // Promote the highest-scoring T3 to T2
    const t3Items = results.filter((r) => r.tier === 3);
    if (t3Items.length > 0) t3Items[0].tier = 2;
  }
  if (!tiers.has(3) && results.length > 2) {
    // Demote the lowest-scoring T2 to T3
    const t2Items = results.filter((r) => r.tier === 2);
    if (t2Items.length > 0) t2Items[t2Items.length - 1].tier = 3;
  }

  // Append soft selling points as tier=0 (unassigned) if not already covered
  const existingFeatures = results.map(r => r.featureName.toLowerCase());
  for (const sp of SOFT_SELLING_POINTS) {
    // Exact match on the canonical names only (no loose substring)
    const exactNames = [sp.nameEn.toLowerCase(), sp.nameZh.toLowerCase(), sp.key];
    const alreadyCovered = existingFeatures.some(existing =>
      exactNames.includes(existing) || exactNames.some(n => existing === n)
    );
    if (!alreadyCovered) {
      results.push({
        tier: 0,
        featureName: sp.nameZh,
        paramValue: '',
        reasoning: undefined,
      });
    }
  }

  return results;
}

// ─── Combined Pipeline ──────────────────────────────────────────

/**
 * Full rule-based pipeline: analyze + tier.
 * Drop-in replacement for the AI analyze-sp-tier endpoint.
 */
export function analyzeAndTier(
  own: ProductInput,
  competitors: ProductInput[],
  locale: string = 'zh'
): { analysis: CompetitiveAnalysis; spItems: SpItemResult[] } {
  const analysis = compareParams(own, competitors, locale);
  const spItems = assignTiers(analysis);
  return { analysis, spItems };
}
