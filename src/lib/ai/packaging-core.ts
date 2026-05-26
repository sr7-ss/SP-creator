/**
 * Shared packaging logic used by both the manual packaging route
 * and the agent's handlePackaging tool.
 */

import { callTracked } from '@/lib/ai/track-call';
import { getPackagingSystemPrompt, getPackagingUserPrompt } from '@/lib/ai/prompts/packaging';
import { prisma } from '@/lib/db/client';
import { checkAndDeductCredit } from '@/lib/auth/credits';
import { AIProvider, NormalizedPackaging } from '@/types';
import { decideSloganTypeForKsp, formatSloganHint } from '@/lib/constants/slogan-strategies';

// ─── JSON Helpers (exported for reuse in review analysis) ────────

export function extractJson(raw: string): string {
  const cleaned = raw
    .replace(/```(?:json|JSON)?\s*\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  const objStart = cleaned.indexOf('{');
  const objEnd = cleaned.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) return cleaned.slice(objStart, objEnd + 1);
  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) return cleaned.slice(arrStart, arrEnd + 1);
  return cleaned;
}

export function safeJsonParse(raw: string): unknown {
  const jsonStr = extractJson(raw);
  try {
    return JSON.parse(jsonStr);
  } catch {
    const fixed = jsonStr.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
    return JSON.parse(fixed);
  }
}

// ─── Normalizer ─────────────────────────────────────────────────

function normalizePkg(
  pkg: unknown,
  originalItem?: { featureName: string; tier: number }
): NormalizedPackaging {
  const p = pkg && typeof pkg === 'object' ? (pkg as Record<string, unknown>) : {};
  const rawAlts = p['l2Alternatives'] || p['l2_alternatives'] || p['alternatives'];
  return {
    featureName: originalItem?.featureName || String(p['featureName'] || ''),
    tier: originalItem?.tier ?? (typeof p['tier'] === 'number' ? p['tier'] as number : 0),
    l1Name: String(p['l1Name'] || p['l1_name'] || p['l1'] || ''),
    l2Slogan: String(p['l2Slogan'] || p['l2_slogan'] || p['l2'] || p['slogan'] || ''),
    l2SloganType: String(p['l2SloganType'] || p['l2_slogan_type'] || p['sloganType'] || 'functional'),
    l2Alternatives: Array.isArray(rawAlts)
      ? rawAlts.map((a: unknown) => {
          const alt = a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
          return { text: String(alt['text'] || ''), type: String(alt['type'] || 'functional') };
        }).filter(a => a.text)
      : undefined,
    l3Details: Array.isArray(p['l3Details'] || p['l3_details'] || p['l3'])
      ? (p['l3Details'] || p['l3_details'] || p['l3']) as NormalizedPackaging['l3Details']
      : [],
  };
}

function extractArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['packagingResults', 'results', 'items']) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
    for (const val of Object.values(obj)) {
      if (Array.isArray(val) && val.length > 0) return val;
    }
  }
  return [];
}

// ─── Main Shared Function ───────────────────────────────────────

export interface RunPackagingParams {
  spItems: Array<{ tier: number; featureName: string; paramValue: string }>;
  productName: string;
  segment: string;
  competitorContext: string;
  positioning?: { targetAudience?: string; productStyle?: string[]; positioning?: string; referencePackaging?: string };
  researchContext?: string;
  /** Strategy key from PACKAGING_STRATEGIES (e.g. "value-for-money"). Determines slogan type per SP. */
  packagingStrategy?: string;
  locale: string;
  userId: string;
  provider: AIProvider;
  apiKey: string;
  model: string;
  deductCredit?: boolean;
  logAction?: string;
  /** 用户针对单个卖点的微调指令 */
  refinementPrompt?: string;
  /** 当前包装结果（微调时传入作为参考） */
  currentPackaging?: {
    l1Name: string;
    l2Slogan: string;
    l2SloganType: string;
    l3Details?: Array<{ name: string; description: string; technique: string }>;
  };
}

export type RunPackagingResult =
  | { packagingResults: NormalizedPackaging[] }
  | { error: string; status: number };

export async function runPackaging(params: RunPackagingParams): Promise<RunPackagingResult> {
  const {
    spItems, productName, segment, competitorContext, positioning, researchContext,
    packagingStrategy,
    locale, userId, provider: aiProvider, apiKey, model,
    deductCredit = false, logAction = 'ai_packaging',
    refinementPrompt, currentPackaging,
  } = params;
  const zh = locale === 'zh';

  if (!spItems || spItems.length === 0) {
    return { error: zh ? '请先生成卖点分级' : 'SP items are required.', status: 400 };
  }

  if (!apiKey) {
    return { error: zh ? '请先在设置中配置 API Key' : 'API key is required.', status: 400 };
  }

  // Credit check
  if (deductCredit) {
    const creditCheck = await checkAndDeductCredit(userId, logAction, aiProvider, model || '');
    if (!creditCheck.ok) {
      return { error: creditCheck.error, status: 403 };
    }
  }

  // ── Knowledge base: query all types ──
  const inputParams = spItems.map(i => i.featureName.toLowerCase());
  const isRelevant = (feature: string) => {
    const f = feature.toLowerCase();
    return inputParams.some(ip => ip.includes(f) || f.includes(ip));
  };

  let brandRules: string[] = [];

  try {
    // Query brand_name entries only. The `packaging` / `competitor` / `rule` types
    // were a previous self-improvement loop (few-shot from user history + competitor
    // copy injection); both have been removed as the prompt-engineering main line is
    // still being tuned and that loop interfered with iteration. Re-enable when the
    // main pipeline is stable.
    const brandNameRows = await prisma.knowledgeEntry.findMany({
      where: { userId, entryType: 'brand_name' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Format: "电池：青海湖电池". Model is instructed (via <规则> L1 section) to combine
    // it with the actual paramValue when generating L1 names.
    brandRules = brandNameRows
      .filter(e => isRelevant(e.feature) && e.marketingName)
      .map(e => `${e.feature}：${e.marketingName}`);
  } catch (err) {
    console.error('[packaging-core] Knowledge lookup failed:', err);
  }

  // ── Prompt ──
  const systemPrompt = getPackagingSystemPrompt(locale, brandRules);

  // Pre-format the per-request context blocks (identical across all batches in this request).
  const referenceStyleBlock = positioning?.referencePackaging
    ? `<参考风格>\n## 上一代产品包装风格（请延续这个风格和调性，不要照抄）：\n${positioning.referencePackaging}\n</参考风格>`
    : undefined;

  const researchContextBlock = researchContext
    ? `<调研发现>\n## 调研发现（用户选择的关键结论，包装时参考）：\n${researchContext}\n</调研发现>`
    : undefined;

  const refinementBlock = (refinementPrompt && currentPackaging)
    ? `<历史版本>\n## 上一版包装：\n${JSON.stringify(currentPackaging, null, 2)}\n</历史版本>\n\n<微调指令>\n## 用户的微调指令：\n${refinementPrompt}\n\n请基于上述指令生成新版本，保持相同的 JSON 格式，新版本应当与上一版有显著差异。\n</微调指令>`
    : undefined;

  // Compute per-row slogan hint based on the active packaging strategy.
  // Result is appended to each <待包装> line so the model follows orders
  // instead of inferring slogan type from rule tables.
  const itemsWithHints = spItems.map(item => ({
    ...item,
    sloganHint: formatSloganHint(decideSloganTypeForKsp(packagingStrategy, item.tier)),
  }));

  const buildUserPromptForItems = (items: typeof itemsWithHints): string => {
    return getPackagingUserPrompt({
      spItems: items,
      productName,
      segment,
      positioning: positioning ? {
        targetAudience: positioning.targetAudience,
        productStyle: positioning.productStyle,
        positioning: positioning.positioning,
      } : undefined,
      competitorContext,
      referenceStyleBlock,
      researchContextBlock,
      refinementBlock,
    });
  };

  // ── Run a single AI call for a subset of itemsWithHints. Returns parsed array (length-aligned with subset). ──
  const runOneBatch = async (items: typeof itemsWithHints, batchAction: string): Promise<{ items: NormalizedPackaging[]; truncated: boolean }> => {
    const response = await callTracked({
      userId,
      action: batchAction,
      provider: aiProvider,
      apiKey,
      model,
      maxTokens: 8192,           // bump from default 4096 for headroom
      cacheSystemPrompt: true,   // Claude only; ignored by other providers
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildUserPromptForItems(items) },
      ],
    });

    const truncated = response.stopReason === 'max_tokens';
    if (truncated) {
      console.warn(`[packaging-core] Output truncated (stopReason=max_tokens) for ${items.length} items`);
    }

    let parsed: unknown;
    try {
      parsed = safeJsonParse(response.content);
    } catch {
      console.error('[packaging-core] Failed to parse:', response.content?.slice(0, 500));
      return { items: items.map((it) => normalizePkg({}, it)), truncated };
    }
    const arr = extractArray(parsed);
    return { items: arr.map((pkg, idx) => normalizePkg(pkg, items[idx])), truncated };
  };

  // ── Main path: single call when N small, otherwise batched. ──
  // Skip batching for refinement mode (always single item).
  const BATCH_THRESHOLD = 11;
  const BATCH_SIZE = 5;
  let normalized: NormalizedPackaging[] = [];

  const shouldBatch = !refinementPrompt && spItems.length >= BATCH_THRESHOLD;
  let needBatch = shouldBatch;

  if (!shouldBatch) {
    const single = await runOneBatch(itemsWithHints, logAction);
    if (single.truncated && itemsWithHints.length > BATCH_SIZE) {
      // Truncation on a single call → redo as batches. (Partial-fill cases are handled by missing-items retry below.)
      console.warn('[packaging-core] Single call truncated; falling back to batched mode');
      needBatch = true;
    } else {
      normalized = single.items;
    }
  }

  if (needBatch) {
    const batches: typeof itemsWithHints[] = [];
    for (let i = 0; i < itemsWithHints.length; i += BATCH_SIZE) {
      batches.push(itemsWithHints.slice(i, i + BATCH_SIZE));
    }
    // First batch alone so it writes cache; rest in parallel hit cache.
    const firstResult = await runOneBatch(batches[0], `${logAction}_batch_1`);
    const restResults = batches.length > 1
      ? await Promise.all(batches.slice(1).map((b, i) => runOneBatch(b, `${logAction}_batch_${i + 2}`)))
      : [];
    normalized = [];
    [firstResult, ...restResults].forEach((br) => normalized.push(...br.items));
  }

  // ── Retry for missing items ──
  const missingIndices = spItems
    .map((_, idx) => idx)
    .filter(idx => !normalized[idx] || !normalized[idx].l1Name);

  if (missingIndices.length > 0 && missingIndices.length < spItems.length) {
    try {
      const missingItems = missingIndices.map(i => itemsWithHints[i]);
      const retryPrompt = `Generate packaging for these ${missingItems.length} items ONLY:\n` +
        missingItems.map(i => `- [T${i.tier}] ${i.featureName}: ${i.paramValue} ${i.sloganHint}`).join('\n') +
        `\nOutput a JSON array with exactly ${missingItems.length} items. Follow the [主 Slogan 用 X 型] hint at the end of each line.`;

      const retryResponse = await callTracked({
        userId,
        action: `${logAction}_retry_missing`,
        provider: aiProvider,
        apiKey,
        model,
        maxTokens: 8192,
        cacheSystemPrompt: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: retryPrompt },
        ],
      });

      const retryParsed = safeJsonParse(retryResponse.content);
      const retryResults = extractArray(retryParsed);

      retryResults.forEach((pkg, retryIdx) => {
        const originalIdx = missingIndices[retryIdx];
        if (originalIdx !== undefined) {
          normalized[originalIdx] = normalizePkg(pkg, spItems[originalIdx]);
        }
      });
    } catch (retryErr) {
      console.error('[packaging-core] Retry failed:', retryErr);
    }
  }

  // Originality is enforced upstream by using placeholders in the system-prompt
  // few-shot ([营销名] / [写实型示例：...] etc). The model cannot copy phrases that
  // don't appear in the prompt, so no post-hoc BANNED_PHRASES blocklist or retry
  // pass is needed here.

  return { packagingResults: normalized };
}
