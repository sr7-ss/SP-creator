/**
 * Review Mining Agent: analyzes product reviews, identifies themes,
 * deep-dives into problem areas, cross-references with competitor specs,
 * and suggests SP tier adjustments.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ReviewDimension, DIMENSION_LABELS } from '@/lib/ai/prompts/review-analysis';
import { mapRawToParams, parseGSMArenaHtml, parse91mobilesHtml, parseCellKaroHtml, parseTechSpecsHtml } from '@/lib/analysis/spec-scraper';
import type { SpItem, ReviewInsight, SpAdjustmentSuggestion } from '@/types';

// ─── Types matching the generic agent-runner interface ─────────────

export type ProgressCallback = (event: { step: string; detail: string; progress: number }) => void;

export interface AgentToolDef {
  definition: Anthropic.Tool;
  handler: (input: unknown, context: AgentContext) => Promise<string>;
}

export interface AgentContext {
  userId: string;
  projectId?: string;
  locale: string;
  provider: string;
  apiKey: string;
  model: string;
  onProgress: ProgressCallback;
  data: Record<string, unknown>;
}

export interface AgentRunnerConfig {
  systemPrompt: string;
  tools: AgentToolDef[];
  maxIterations?: number;
  agentName?: string;
}

export interface AgentResult {
  success: boolean;
  summary: string;
  data: Record<string, unknown>;
}

// ─── Constants ─────────────────────────────────────────────────────

const DIMENSIONS: readonly string[] = [
  'battery', 'display', 'camera', 'performance', 'design',
  'price', 'software', 'durability', 'audio', 'connectivity', 'other',
];

const BATCH_SIZE = 30;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
};

// ─── Tool Definitions ──────────────────────────────────────────────

const analyzeReviewsTool: AgentToolDef = {
  definition: {
    name: 'analyze_reviews',
    description:
      'Batch analyze product reviews for sentiment, score, dimensions, and highlights. ' +
      'Processes up to 30 reviews at a time. Returns per-review results and a batch summary.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reviews: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of review texts to analyze',
        },
        productName: {
          type: 'string',
          description: 'Optional product name for context',
        },
      },
      required: ['reviews'],
    },
  },
  handler: async (input: unknown, context: AgentContext): Promise<string> => {
    const { reviews, productName } = input as { reviews: string[]; productName?: string };
    const zh = context.locale === 'zh';

    context.onProgress({
      step: 'analyze_reviews',
      detail: zh ? `正在分析 ${reviews.length} 条评论...` : `Analyzing ${reviews.length} reviews...`,
      progress: 0.1,
    });

    // Split into batches
    const batches: string[][] = [];
    for (let i = 0; i < reviews.length; i += BATCH_SIZE) {
      batches.push(reviews.slice(i, i + BATCH_SIZE));
    }

    const allResults: Array<{
      text: string;
      sentiment: string;
      score: number;
      dimensions: string[];
      highlights: string[];
    }> = [];

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];

      context.onProgress({
        step: 'analyze_reviews',
        detail: zh
          ? `正在分析第 ${batchIdx + 1}/${batches.length} 批评论 (${batch.length} 条)...`
          : `Analyzing batch ${batchIdx + 1}/${batches.length} (${batch.length} reviews)...`,
        progress: 0.1 + (batchIdx / batches.length) * 0.3,
      });

      // This tool returns the reviews data for the LLM to process
      // The actual LLM analysis happens in the agent loop via the system prompt
      for (const text of batch) {
        allResults.push({
          text,
          sentiment: 'neutral',
          score: 0,
          dimensions: [],
          highlights: [],
        });
      }
    }

    // Store raw reviews in context for downstream tools
    context.data.reviews = reviews;
    context.data.productName = productName;

    const prompt = buildAnalysisPrompt(reviews, productName, context.locale);

    return JSON.stringify({
      instruction: 'Use the AI to analyze these reviews. Return the analysis as JSON.',
      prompt,
      reviewCount: reviews.length,
      batchCount: batches.length,
    });
  },
};

const deepDiveThemeTool: AgentToolDef = {
  definition: {
    name: 'deep_dive_theme',
    description:
      'Deep-dive into a specific theme from the review analysis. ' +
      'Filters related reviews, identifies root causes, sub-themes, severity, and actionable insights.',
    input_schema: {
      type: 'object' as const,
      properties: {
        theme: {
          type: 'string',
          description: 'The theme to deep-dive into (e.g., "battery", "camera")',
        },
        reviews: {
          type: 'array',
          items: { type: 'string' },
          description: 'Reviews related to this theme',
        },
      },
      required: ['theme', 'reviews'],
    },
  },
  handler: async (input: unknown, context: AgentContext): Promise<string> => {
    const { theme, reviews } = input as { theme: string; reviews: string[] };
    const zh = context.locale === 'zh';

    context.onProgress({
      step: 'deep_dive',
      detail: zh ? `正在深入分析主题「${theme}」...` : `Deep-diving into theme "${theme}"...`,
      progress: 0.5,
    });

    return JSON.stringify({
      theme,
      reviewCount: reviews.length,
      reviews: reviews.slice(0, 50), // Cap for context window
      instruction: `Analyze these ${reviews.length} reviews about "${theme}". Return JSON: { rootCause, subThemes[], severity: "high"|"medium"|"low", actionableInsight }`,
    });
  },
};

const crossReferenceSpecsTool: AgentToolDef = {
  definition: {
    name: 'cross_reference_specs',
    description:
      'Cross-reference a review insight with actual product specs. ' +
      'Scrapes specs for the product and optionally competitors, compares relevant parameters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        theme: {
          type: 'string',
          description: 'The review theme (e.g., "battery")',
        },
        insight: {
          type: 'string',
          description: 'The insight from deep-dive analysis',
        },
        productName: {
          type: 'string',
          description: 'Product name to look up specs for',
        },
        competitorNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional competitor names to compare with',
        },
      },
      required: ['theme', 'insight', 'productName'],
    },
  },
  handler: async (input: unknown, context: AgentContext): Promise<string> => {
    const { theme, insight, productName, competitorNames } = input as {
      theme: string;
      insight: string;
      productName: string;
      competitorNames?: string[];
    };
    const zh = context.locale === 'zh';

    context.onProgress({
      step: 'cross_reference',
      detail: zh
        ? `正在交叉对比「${productName}」的规格参数...`
        : `Cross-referencing specs for "${productName}"...`,
      progress: 0.65,
    });

    // Fetch specs for the main product
    const productSpecs = await fetchProductSpecs(productName);
    const competitorSpecs: Record<string, Record<string, string>> = {};

    if (competitorNames?.length) {
      for (const comp of competitorNames.slice(0, 3)) {
        context.onProgress({
          step: 'cross_reference',
          detail: zh
            ? `正在获取竞品「${comp}」参数...`
            : `Fetching specs for competitor "${comp}"...`,
          progress: 0.7,
        });
        competitorSpecs[comp] = await fetchProductSpecs(comp);
      }
    }

    return JSON.stringify({
      theme,
      insight,
      productName,
      productSpecs,
      competitorSpecs,
      instruction: `Compare the specs for "${productName}" vs competitors regarding "${theme}". Determine if the review complaints represent a real spec weakness or a perception issue.`,
    });
  },
};

const suggestSpAdjustmentsTool: AgentToolDef = {
  definition: {
    name: 'suggest_ksp_adjustments',
    description:
      'Based on review insights, suggest which features should move up/down in SP tiers, or new features to add.',
    input_schema: {
      type: 'object' as const,
      properties: {
        insights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              theme: { type: 'string' },
              sentiment: { type: 'string' },
              count: { type: 'number' },
              severity: { type: 'string' },
              actionableInsight: { type: 'string' },
            },
          },
          description: 'Review insights from deep-dive analysis',
        },
        currentSpItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              tier: { type: 'number' },
              featureName: { type: 'string' },
              paramValue: { type: 'string' },
            },
          },
          description: 'Current SP items from the project (optional)',
        },
      },
      required: ['insights'],
    },
  },
  handler: async (input: unknown, context: AgentContext): Promise<string> => {
    const { insights, currentSpItems } = input as {
      insights: ReviewInsight[];
      currentSpItems?: SpItem[];
    };
    const zh = context.locale === 'zh';

    context.onProgress({
      step: 'ksp_suggestions',
      detail: zh ? '正在生成 SP 调整建议...' : 'Generating SP adjustment suggestions...',
      progress: 0.85,
    });

    return JSON.stringify({
      insights,
      currentSpItems: currentSpItems || [],
      instruction: `Based on these review insights, suggest SP tier adjustments. For each suggestion, provide: featureName, suggestedTier (1/2/3), direction (promote/demote/add/keep), reason, confidence (0-1). Return JSON array of suggestions.`,
    });
  },
};

// ─── Helpers ───────────────────────────────────────────────────────

async function fetchProductSpecs(deviceName: string): Promise<Record<string, string>> {
  const slug = deviceName.toLowerCase().replace(/\s+/g, '-');
  const sources = [
    { name: 'GSMArena', url: `https://www.gsmarena.com/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(deviceName)}`, parse: parseGSMArenaHtml },
    { name: '91mobiles', url: `https://www.91mobiles.com/${slug}-price-in-india`, parse: parse91mobilesHtml },
    { name: 'TechSpecs', url: `https://techspecs.info/device/${slug}`, parse: parseTechSpecsHtml },
    { name: 'CellKaro', url: `https://www.cellkaro.com/${slug}`, parse: parseCellKaroHtml },
  ];

  const mergedSpecs: Record<string, string> = {};

  for (const src of sources) {
    try {
      let res = await fetch(src.url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      let html = await res.text();

      if (src.name === 'GSMArena' && src.url.includes('results.php3')) {
        const detailMatch = html.match(/<a\s+href="([^"]+\.php)"\s*>\s*<img/i)
          || html.match(/<a\s+href="([\w_]+-\d+\.php)"/i);
        if (detailMatch) {
          const detailUrl = `https://www.gsmarena.com/${detailMatch[1]}`;
          try {
            res = await fetch(detailUrl, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(8000) });
            if (res.ok) html = await res.text();
          } catch { /* use search page */ }
        }
      }

      if (html.length < 2000) continue;
      const raw = src.parse(html);
      const specs = mapRawToParams(raw);
      for (const [k, v] of Object.entries(specs)) {
        if (!mergedSpecs[k]) mergedSpecs[k] = v;
      }
    } catch { /* skip */ }
  }

  return mergedSpecs;
}

function buildAnalysisPrompt(reviews: string[], productName: string | undefined, locale: string): string {
  const zh = locale === 'zh';
  let prompt = '';
  if (productName) {
    prompt += `Product: ${productName}\n\n`;
  }
  prompt += zh
    ? `请分析以下 ${reviews.length} 条评论。对每条评论返回:\n`
    : `Analyze these ${reviews.length} reviews. For each review return:\n`;
  prompt += `- sentiment: "positive" | "negative" | "neutral"\n`;
  prompt += `- score: -1.0 to 1.0\n`;
  prompt += `- dimensions: from [${DIMENSIONS.join(', ')}]\n`;
  prompt += `- highlights: 1-3 key phrases\n\n`;
  reviews.forEach((r, i) => {
    prompt += `[${i + 1}] ${r}\n`;
  });
  prompt += `\nReturn a JSON array with exactly ${reviews.length} items. Each item: { text, sentiment, score, dimensions, highlights }`;
  return prompt;
}

// ─── Agent Config Export ───────────────────────────────────────────

export function getReviewMiningAgentConfig(locale: string): AgentRunnerConfig {
  const zh = locale === 'zh';

  const dimensionList = DIMENSIONS.map(d => {
    const label = DIMENSION_LABELS[d as ReviewDimension];
    return label ? `${d} (${zh ? label.zh : label.en})` : d;
  }).join(', ');

  const systemPrompt = zh
    ? `你是一个产品评论挖掘 Agent，用于竞品分析。分析用户评论以提取可操作的洞察。

工作流程：
1. 使用 analyze_reviews 批量分析所有评论（按 ${BATCH_SIZE} 条分批），识别情感、维度、关键词
2. 识别前 3 个最有影响力的主题/维度
3. 对每个重要主题使用 deep_dive_theme 深入分析，找出根因
4. 如果提供了产品名称，使用 cross_reference_specs 交叉对比参数规格
5. 最后使用 suggest_ksp_adjustments 生成 SP 卖点调整建议

可用维度：${dimensionList}

要求：
- 分析要全面但输出简洁
- 对每条评论都要有准确的情感判断
- 深入分析要找出真正的问题根因
- SP 建议要具体、可执行
- 用中文回复`
    : `You are a review mining agent for product competitive analysis. Analyze customer reviews to extract actionable insights.

Workflow:
1. Use analyze_reviews to batch-analyze all reviews (${BATCH_SIZE} at a time), identifying sentiment, dimensions, key phrases
2. Identify the top 3 most impactful themes/dimensions
3. For each major theme, use deep_dive_theme to understand root causes
4. If a product name is provided, use cross_reference_specs to verify insights against actual specs
5. Finally, use suggest_ksp_adjustments to generate SP tier adjustment suggestions

Available dimensions: ${dimensionList}

Requirements:
- Be thorough in analysis but concise in output
- Accurately classify sentiment for every review
- Deep-dives should uncover genuine root causes
- SP suggestions should be specific and actionable
- Respond in English`;

  return {
    systemPrompt,
    tools: [
      analyzeReviewsTool,
      deepDiveThemeTool,
      crossReferenceSpecsTool,
      suggestSpAdjustmentsTool,
    ],
    maxIterations: 15,
    agentName: 'reviews',
  };
}
