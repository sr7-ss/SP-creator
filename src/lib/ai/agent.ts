/**
 * KSP Agent: Uses Anthropic SDK with tool_use to orchestrate the full
 * competitor analysis → KSP grading → packaging pipeline.
 *
 * The Agent decides which tools to call and in what order.
 * Progress is reported via a callback for SSE streaming.
 */

import Anthropic from '@anthropic-ai/sdk';
import { analyzeAndTier } from '@/lib/analysis/rule-engine';
import { mapRawToParams, parseGSMArenaHtml, parse91mobilesHtml, parseCellKaroHtml, parseTechSpecsHtml } from '@/lib/analysis/spec-scraper';
import { prisma } from '@/lib/db/client';
import { decrypt } from '@/lib/crypto';
import { runPackaging } from '@/lib/ai/packaging-core';
import { AIProvider, NormalizedPackaging } from '@/types';

// ─── Types ───────────────────────────────────────────────────────

interface AgentConfig {
  projectId: string;
  userId: string;
  ownProductName: string;
  ownProductParams: Record<string, string>;
  market: string;
  segment?: string;
  locale: string;
  /** Provider + key for the orchestration model (cheap model) */
  orchestrationProvider: string;
  orchestrationApiKey: string;
  orchestrationModel: string;
  /** Provider + key for packaging (quality model) */
  packagingProvider: string;
  packagingApiKey: string;
  packagingModel: string;
  /** If true, skip packaging step — user will review KSP first (human-in-the-loop) */
  skipPackaging?: boolean;
}

type ProgressCallback = (event: {
  step: string;
  detail: string;
  progress: number;
}) => void;

interface AgentResult {
  success: boolean;
  summary: string;
  kspItems?: Array<{ tier: number; featureName: string; paramValue: string }>;
  competitors?: Array<{ name: string; params: Record<string, string> }>;
  analysis?: unknown;
  error?: string;
}

// ─── Tool Definitions ────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'fetch_competitor_specs',
    description: 'Fetch phone specs from web data sources (GSMArena, 91mobiles, etc). Returns structured parameters for a competitor device.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deviceName: { type: 'string', description: 'Device name, e.g. "vivo T4x 5G"' },
        market: { type: 'string', description: 'Target market, e.g. "印度"' },
      },
      required: ['deviceName'],
    },
  },
  {
    name: 'run_comparison',
    description: 'Run competitive analysis comparing own product against competitors. Uses rule-based engine (no AI). Returns analysis + KSP tier assignments.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ownProduct: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            params: { type: 'object', additionalProperties: { type: 'string' } },
          },
          required: ['name', 'params'],
        },
        competitors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              params: { type: 'object', additionalProperties: { type: 'string' } },
            },
            required: ['name', 'params'],
          },
        },
      },
      required: ['ownProduct', 'competitors'],
    },
  },
  {
    name: 'generate_packaging',
    description: 'Generate L1/L2/L3 selling point packaging for KSP items using AI. Returns marketing copy for each feature.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kspItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tier: { type: 'number' },
              featureName: { type: 'string' },
              paramValue: { type: 'string' },
            },
          },
        },
        productName: { type: 'string' },
        segment: { type: 'string' },
        competitorContext: { type: 'string' },
      },
      required: ['kspItems', 'productName'],
    },
  },
  {
    name: 'save_results',
    description: 'Save all results (competitor products, analysis, KSP items) to the database.',
    input_schema: {
      type: 'object' as const,
      properties: {
        competitors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              params: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
        },
        kspItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tier: { type: 'number' },
              featureName: { type: 'string' },
              paramValue: { type: 'string' },
              l1Name: { type: 'string' },
              l2Slogan: { type: 'string' },
              l2SloganType: { type: 'string' },
            },
          },
        },
      },
      required: ['competitors', 'kspItems'],
    },
  },
];

// ─── Tool Handlers ───────────────────────────────────────────────

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
};

async function handleFetchSpecs(
  input: { deviceName: string; market?: string },
  onProgress: ProgressCallback
): Promise<string> {
  onProgress({ step: 'fetch_specs', detail: `正在搜索 ${input.deviceName} 参数...`, progress: 0.1 });

  const slug = input.deviceName.toLowerCase().replace(/\s+/g, '-');
  const sources = [
    { name: 'GSMArena', url: `https://www.gsmarena.com/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(input.deviceName)}`, parse: parseGSMArenaHtml },
    { name: '91mobiles', url: `https://www.91mobiles.com/${slug}-price-in-india`, parse: parse91mobilesHtml },
    { name: 'TechSpecs', url: `https://techspecs.info/device/${slug}`, parse: parseTechSpecsHtml },
    { name: 'CellKaro', url: `https://www.cellkaro.com/${slug}`, parse: parseCellKaroHtml },
  ];

  const mergedSpecs: Record<string, string> = {};
  const foundSources: string[] = [];

  for (const src of sources) {
    try {
      let res = await fetch(src.url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      let html = await res.text();

      // GSMArena: follow search result to detail page
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
      if (Object.keys(specs).length > 0) {
        foundSources.push(src.name);
        for (const [k, v] of Object.entries(specs)) {
          if (!mergedSpecs[k]) mergedSpecs[k] = v;
        }
      }
    } catch { /* skip */ }
  }

  const count = Object.keys(mergedSpecs).length;
  return JSON.stringify({
    specs: mergedSpecs,
    foundCount: count,
    sources: foundSources.join(' + '),
    deviceName: input.deviceName,
  });
}

function handleComparison(
  input: { ownProduct: { name: string; params: Record<string, string> }; competitors: Array<{ name: string; params: Record<string, string> }> },
  onProgress: ProgressCallback
): string {
  onProgress({ step: 'analysis', detail: '正在运行竞品分析和 KSP 分级...', progress: 0.5 });

  const { analysis, kspItems } = analyzeAndTier(
    input.ownProduct,
    input.competitors,
    'zh'
  );

  return JSON.stringify({ analysis, kspItems });
}

async function handlePackaging(
  input: { kspItems: Array<{ tier: number; featureName: string; paramValue: string }>; productName: string; segment?: string; competitorContext?: string },
  config: AgentConfig,
  onProgress: ProgressCallback
): Promise<string> {
  onProgress({ step: 'packaging', detail: '正在生成卖点包装...', progress: 0.7 });

  const result = await runPackaging({
    kspItems: input.kspItems,
    productName: input.productName,
    segment: input.segment || '',
    competitorContext: input.competitorContext || '',
    locale: config.locale,
    userId: config.userId,
    provider: config.packagingProvider as AIProvider,
    apiKey: config.packagingApiKey,
    model: config.packagingModel,
    deductCredit: true,
    logAction: 'ai_agent_packaging',
  });

  return JSON.stringify(result);
}

async function handleSave(
  input: {
    competitors: Array<{ name: string; params: Record<string, string> }>;
    kspItems: Array<{ tier: number; featureName: string; paramValue: string; l1Name?: string; l2Slogan?: string; l2SloganType?: string; l2Alternatives?: unknown; l3Details?: unknown }>;
    analysis?: unknown;
  },
  config: AgentConfig,
  onProgress: ProgressCallback
): Promise<string> {
  onProgress({ step: 'save', detail: '正在保存结果...', progress: 0.9 });

  // Remove old competitor products for this project, then re-create
  await prisma.product.deleteMany({
    where: { projectId: config.projectId, isOwnProduct: false },
  });
  for (const [idx, comp] of input.competitors.entries()) {
    await prisma.product.create({
      data: {
        projectId: config.projectId,
        name: comp.name,
        isOwnProduct: false,
        params: comp.params,
        sortOrder: idx + 1,
      },
    });
  }

  // Save analysis
  if (input.analysis) {
    try {
      await prisma.analysis.deleteMany({ where: { projectId: config.projectId } });
      await prisma.analysis.create({
        data: {
          projectId: config.projectId,
          result: JSON.parse(JSON.stringify(input.analysis)),
        },
      });
    } catch (err) {
      console.error('[agent] Failed to save analysis:', err);
    }
  }

  // Save KSP results
  await prisma.kspResult.deleteMany({ where: { projectId: config.projectId } });
  for (const [idx, ksp] of input.kspItems.entries()) {
    await prisma.kspResult.create({
      data: {
        projectId: config.projectId,
        tier: ksp.tier,
        featureName: ksp.featureName,
        paramValue: ksp.paramValue,
        l1Name: ksp.l1Name || null,
        l2Slogan: ksp.l2Slogan || null,
        l2SloganType: ksp.l2SloganType || null,
        l2Alternatives: ksp.l2Alternatives ?? undefined,
        l3Details: ksp.l3Details ?? undefined,
        sortOrder: idx,
      },
    });
  }

  return JSON.stringify({ success: true });
}

// ─── Agent Loop ──────────────────────────────────────────────────

/**
 * Get Anthropic-compatible base URL for a provider.
 * Only providers with Anthropic Messages protocol support can be used for Agent orchestration.
 */
function getBaseUrl(provider: string): string | undefined {
  switch (provider) {
    case 'claude': return undefined; // default Anthropic API
    case 'zhipu': return 'https://open.bigmodel.cn/api/anthropic';
    case 'kimi': return 'https://api.moonshot.cn/anthropic';
    case 'minimax': return 'https://api.minimax.chat/anthropic';
    default: return undefined;
  }
}

/** Providers that support Anthropic Messages protocol (can be used for Agent orchestration) */
const ANTHROPIC_COMPATIBLE_PROVIDERS = new Set(['claude', 'zhipu', 'kimi', 'minimax']);

export function isAnthropicCompatible(provider: string): boolean {
  return ANTHROPIC_COMPATIBLE_PROVIDERS.has(provider);
}

export async function runAgent(
  config: AgentConfig,
  userMessage: string,
  onProgress: ProgressCallback
): Promise<AgentResult> {
  const baseUrl = getBaseUrl(config.orchestrationProvider);

  const client = new Anthropic({
    apiKey: config.orchestrationApiKey,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  });

  const ownHasParams = config.ownProductParams && Object.keys(config.ownProductParams).length > 0;

  const skipPkg = !!config.skipPackaging;

  const systemPrompt = `You are a KSP (Key Selling Point) analysis agent for mobile phones.
You have access to tools to:
1. Fetch device specs from the web (works for BOTH own product and competitors)
2. Run competitive analysis and KSP tier assignment
${skipPkg ? '' : '3. Generate selling point packaging (L1 name, L2 slogan, L3 sub-points)\n'}${skipPkg ? '3' : '4'}. Save results to the database

The user's own product is: ${config.ownProductName}
${ownHasParams
  ? `Own product params: ${JSON.stringify(config.ownProductParams)}`
  : `Own product has NO params yet — you MUST use fetch_competitor_specs to fetch "${config.ownProductName}" specs first before running comparison.`}
Market: ${config.market}
${config.segment ? `Price segment: ${config.segment}` : ''}

Execute the pipeline:
${ownHasParams ? '' : `1. Fetch own product specs for "${config.ownProductName}"\n`}${ownHasParams ? '1' : '2'}. Fetch competitor specs from the web
${ownHasParams ? '2' : '3'}. Run comparison (pass own product with params + competitors with params)
${skipPkg ? '' : `${ownHasParams ? '3' : '4'}. Generate packaging\n`}${skipPkg ? (ownHasParams ? '3' : '4') : (ownHasParams ? '4' : '5')}. Save results

IMPORTANT: When calling run_comparison, you MUST include the own product's params (either from above or from fetch_competitor_specs result). Do NOT pass empty params.
Always call save_results at the end to persist everything.${skipPkg ? '\nDo NOT call generate_packaging — the user will review KSP tiers first and generate packaging separately.' : ''}
Respond in ${config.locale === 'zh' ? 'Chinese' : 'English'}.`;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  let iterations = 0;
  const maxIterations = 10;
  // Track data across tool calls
  const competitorData: Array<{ name: string; params: Record<string, string> }> = [];
  let ownProductParams = { ...config.ownProductParams }; // may be enriched by fetch_competitor_specs
  let lastKspItems: Array<{ tier: number; featureName: string; paramValue: string; l1Name?: string; l2Slogan?: string; l2SloganType?: string; l2Alternatives?: NormalizedPackaging['l2Alternatives']; l3Details?: NormalizedPackaging['l3Details'] }> = [];
  let lastAnalysis: unknown = null;

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.messages.create({
      model: config.orchestrationModel,
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    // Check if we're done (no more tool calls)
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      return {
        success: true,
        summary: textBlock ? (textBlock as Anthropic.TextBlock).text : 'Analysis completed.',
        kspItems: lastKspItems,
        competitors: competitorData,
        analysis: lastAnalysis,
      };
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find(b => b.type === 'text');
      return {
        success: true,
        summary: textBlock ? (textBlock as Anthropic.TextBlock).text : 'Analysis completed.',
        kspItems: lastKspItems,
        competitors: competitorData,
        analysis: lastAnalysis,
      };
    }

    // Add assistant message with all content blocks
    messages.push({ role: 'assistant', content: response.content });

    // Execute each tool and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      let result: string;
      try {
        switch (toolUse.name) {
          case 'fetch_competitor_specs': {
            result = await handleFetchSpecs(toolUse.input as { deviceName: string; market?: string }, onProgress);
            const parsed = JSON.parse(result);
            if (parsed.foundCount > 0) {
              // Check if this is the own product (by name similarity)
              const fetchedName = (parsed.deviceName || '').toLowerCase();
              const ownName = config.ownProductName.toLowerCase();
              const isOwnProduct = fetchedName.includes(ownName) || ownName.includes(fetchedName)
                || fetchedName.replace(/\s+/g, '') === ownName.replace(/\s+/g, '');

              if (isOwnProduct) {
                ownProductParams = { ...ownProductParams, ...parsed.specs };
                // Update own product in DB
                try {
                  const ownProd = await prisma.product.findFirst({
                    where: { projectId: config.projectId, isOwnProduct: true },
                  });
                  if (ownProd) {
                    const existingParams = (ownProd.params && typeof ownProd.params === 'object' ? ownProd.params : {}) as Record<string, string>;
                    await prisma.product.update({
                      where: { id: ownProd.id },
                      data: { params: { ...existingParams, ...parsed.specs } },
                    });
                  }
                } catch (err) {
                  console.error('[agent] Failed to update own product params:', err);
                }
              } else {
                competitorData.push({ name: parsed.deviceName, params: parsed.specs });
              }
            }
            break;
          }
          case 'run_comparison': {
            result = handleComparison(toolUse.input as Parameters<typeof handleComparison>[0], onProgress);
            const parsed = JSON.parse(result);
            lastKspItems = parsed.kspItems;
            lastAnalysis = parsed.analysis;
            break;
          }
          case 'generate_packaging': {
            result = await handlePackaging(toolUse.input as Parameters<typeof handlePackaging>[0], config, onProgress);
            // Parse packaging results and merge into kspItems (now includes l3Details)
            try {
              const parsed = JSON.parse(result);
              const pkgArray: NormalizedPackaging[] = parsed.packagingResults || [];
              for (const pkg of pkgArray) {
                const match = lastKspItems.find(k =>
                  k.featureName.toLowerCase().includes(pkg.featureName?.toLowerCase() || '') ||
                  (pkg.featureName || '').toLowerCase().includes(k.featureName.toLowerCase())
                );
                if (match) {
                  match.l1Name = pkg.l1Name;
                  match.l2Slogan = pkg.l2Slogan;
                  match.l2SloganType = pkg.l2SloganType;
                  match.l2Alternatives = pkg.l2Alternatives;
                  match.l3Details = pkg.l3Details;
                }
              }
            } catch { /* packaging parse failed, keep raw result */ }
            break;
          }
          case 'save_results': {
            const saveInput = toolUse.input as Parameters<typeof handleSave>[0];
            // Enrich with collected data
            if (saveInput.competitors.length === 0 && competitorData.length > 0) {
              saveInput.competitors = competitorData;
            }
            if (saveInput.kspItems.length === 0 && lastKspItems.length > 0) {
              saveInput.kspItems = lastKspItems;
            }
            // Always pass analysis from the comparison step
            saveInput.analysis = lastAnalysis;
            result = await handleSave(saveInput, config, onProgress);
            break;
          }
          default:
            result = JSON.stringify({ error: `Unknown tool: ${toolUse.name}` });
        }
      } catch (err) {
        result = JSON.stringify({ error: err instanceof Error ? err.message : 'Tool execution failed' });
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Add tool results back to messages
    messages.push({ role: 'user', content: toolResults });
  }

  return {
    success: false,
    summary: 'Agent reached maximum iterations without completing.',
    error: 'max_iterations_reached',
  };
}
