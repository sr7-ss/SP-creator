/**
 * Competitive Discovery Agent
 *
 * Helps users discover which competitors to analyze by searching product
 * databases, scraping specs, and recommending the best competitors to add.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  parseGSMArenaHtml,
  parse91mobilesHtml,
  parseCellKaroHtml,
  parseTechSpecsHtml,
  mapRawToParams,
} from '@/lib/analysis/spec-scraper';

// ─── Types (matching agent-runner.ts, being built in parallel) ──

type ProgressCallback = (event: { step: string; detail: string; progress: number }) => void;

interface AgentToolDef {
  definition: Anthropic.Tool;
  handler: (input: unknown, context: AgentContext) => Promise<string>;
}

interface AgentContext {
  userId: string;
  projectId?: string;
  locale: string;
  provider: string;
  apiKey: string;
  model: string;
  onProgress: ProgressCallback;
  data: Record<string, unknown>;
}

interface AgentRunnerConfig {
  systemPrompt: string;
  tools: AgentToolDef[];
  maxIterations?: number;
  agentName?: string;
}

// ─── Constants ──────────────────────────────────────────────────

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Accept: 'text/html,application/xhtml+xml',
};

// ─── Tool: search_products ──────────────────────────────────────

interface SearchProductsInput {
  query: string;
  market: string;
}

interface SearchResult {
  name: string;
  url: string;
  source: string;
}

/**
 * Parse GSMArena search results page to extract product links.
 */
function parseGSMArenaSearchResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  // GSMArena search results structure (2025):
  // <a href="vivo_t4x-13707.php"><img ...><strong><span>vivo<br>T4x</span></strong></a>
  // Pattern: match the <a> href, then extract text from the inner <span>
  const pattern =
    /<a\s+href="([\w_]+-\d+\.php)"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const slug = match[1];
    if (seen.has(slug)) continue;
    const url = `https://www.gsmarena.com/${slug}`;
    const name = match[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&Prime;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    if (name && name.length > 2 && name.length < 100) {
      seen.add(slug);
      results.push({ name, url, source: 'GSMArena' });
    }
  }

  // Fallback: match any anchor with a device-slug href inside .makers section
  if (results.length === 0) {
    const makersMatch = html.match(/<div\s+class="makers">([\s\S]*?)<\/div>/i);
    if (makersMatch) {
      const linkPattern = /<a\s+href="([\w_]+-\d+\.php)"[^>]*>([\s\S]*?)<\/a>/gi;
      while ((match = linkPattern.exec(makersMatch[1])) !== null) {
        const slug = match[1];
        if (seen.has(slug)) continue;
        const url = `https://www.gsmarena.com/${slug}`;
        const name = match[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim();
        if (name && name.length > 2 && name.length < 100) {
          seen.add(slug);
          results.push({ name, url, source: 'GSMArena' });
        }
      }
    }
  }

  return results;
}

/**
 * Parse 91mobiles search/listing page to extract product links.
 */
function parse91mobilesSearchResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // 91mobiles product cards: <a href="/samsung-galaxy-a55-price-in-india" ... >Samsung Galaxy A55</a>
  const pattern =
    /<a\s+href="(\/[a-z0-9-]+-price-in-india[^"]*)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const url = `https://www.91mobiles.com${match[1]}`;
    const name = match[2].replace(/&amp;/g, '&').trim();
    if (name && name.length > 3 && name.length < 100) {
      results.push({ name, url, source: '91mobiles' });
    }
  }
  return results;
}

async function handleSearchProducts(
  input: unknown,
  context: AgentContext
): Promise<string> {
  const { query, market } = input as SearchProductsInput;
  context.onProgress({
    step: 'search',
    detail: `Searching for "${query}" in ${market}...`,
    progress: 0.1,
  });

  const allResults: SearchResult[] = [];
  const seen = new Set<string>();

  // Source 1: GSMArena search
  try {
    const gsmaUrl = `https://www.gsmarena.com/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(query)}`;
    const res = await fetch(gsmaUrl, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();
      const items = parseGSMArenaSearchResults(html);
      for (const item of items) {
        const key = item.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          allResults.push(item);
        }
      }
    }
  } catch {
    /* skip */
  }

  // Source 2: 91mobiles search (India market)
  if (
    market.toLowerCase().includes('india') ||
    market.includes('印度') ||
    market.toLowerCase().includes('in')
  ) {
    try {
      const slug91 = query.toLowerCase().replace(/\s+/g, '-');
      const url91 = `https://www.91mobiles.com/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(url91, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const html = await res.text();
        const items = parse91mobilesSearchResults(html);
        for (const item of items) {
          const key = item.name.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            allResults.push(item);
          }
        }
      }
    } catch {
      /* skip */
    }
  }

  context.onProgress({
    step: 'search',
    detail: `Found ${allResults.length} products`,
    progress: 0.2,
  });

  return JSON.stringify({
    results: allResults.slice(0, 20), // cap at 20
    totalFound: allResults.length,
    query,
    market,
  });
}

// ─── Tool: scrape_specs ─────────────────────────────────────────

interface ScrapeSpecsInput {
  deviceName: string;
  market: string;
}

/**
 * Reuses the same scraping logic from agent.ts handleFetchSpecs.
 */
async function handleScrapeSpecs(
  input: unknown,
  context: AgentContext
): Promise<string> {
  const { deviceName, market } = input as ScrapeSpecsInput;
  context.onProgress({
    step: 'scrape',
    detail: `Scraping specs for ${deviceName}...`,
    progress: 0.3,
  });

  const slug = deviceName.toLowerCase().replace(/\s+/g, '-');
  const sources = [
    {
      name: 'GSMArena',
      url: `https://www.gsmarena.com/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(deviceName)}`,
      parse: parseGSMArenaHtml,
    },
    {
      name: '91mobiles',
      url: `https://www.91mobiles.com/${slug}-price-in-india`,
      parse: parse91mobilesHtml,
    },
    {
      name: 'TechSpecs',
      url: `https://techspecs.info/device/${slug}`,
      parse: parseTechSpecsHtml,
    },
    {
      name: 'CellKaro',
      url: `https://www.cellkaro.com/${slug}`,
      parse: parseCellKaroHtml,
    },
  ];

  const mergedSpecs: Record<string, string> = {};
  const foundSources: string[] = [];

  for (const src of sources) {
    try {
      let res = await fetch(src.url, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      let html = await res.text();

      // GSMArena: follow search result to detail page
      if (src.name === 'GSMArena' && src.url.includes('results.php3')) {
        const detailMatch =
          html.match(/<a\s+href="([^"]+\.php)"\s*>\s*<img/i) ||
          html.match(/<a\s+href="([\w_]+-\d+\.php)"/i);
        if (detailMatch) {
          const detailUrl = `https://www.gsmarena.com/${detailMatch[1]}`;
          try {
            res = await fetch(detailUrl, {
              headers: FETCH_HEADERS,
              signal: AbortSignal.timeout(8000),
            });
            if (res.ok) html = await res.text();
          } catch {
            /* use search page */
          }
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
    } catch {
      /* skip */
    }
  }

  const count = Object.keys(mergedSpecs).length;

  // Store scraped product in context.data for final result
  if (count > 0) {
    if (!Array.isArray(context.data.competitors)) context.data.competitors = [];
    (context.data.competitors as Array<{ name: string; params: Record<string, string>; rationale: string; sources: string[] }>).push({
      name: deviceName,
      params: mergedSpecs,
      rationale: '',
      sources: foundSources,
    });
  }

  return JSON.stringify({
    specs: mergedSpecs,
    foundCount: count,
    sources: foundSources.join(' + '),
    deviceName,
  });
}

// ─── Tool: recommend_competitors ────────────────────────────────

interface RecommendInput {
  category: string;
  priceRange: string;
  market: string;
  foundProducts: Array<{
    name: string;
    params: Record<string, string>;
  }>;
}

async function handleRecommendCompetitors(
  input: unknown,
  context: AgentContext
): Promise<string> {
  const { category, priceRange, market, foundProducts } =
    input as RecommendInput;
  context.onProgress({
    step: 'recommend',
    detail: `Analyzing ${foundProducts.length} products to pick best competitors...`,
    progress: 0.7,
  });

  // This tool is LLM-based — the agent itself will reason about the products
  // and call this tool with the foundProducts list. We format the data
  // for the agent to make a recommendation in its response.
  const productSummaries = foundProducts.map((p) => {
    const keyParams: string[] = [];
    if (p.params['platform.chipset']) keyParams.push(`Chipset: ${p.params['platform.chipset']}`);
    if (p.params['battery.type']) keyParams.push(`Battery: ${p.params['battery.type']}`);
    if (p.params['display.type']) keyParams.push(`Display: ${p.params['display.type']}`);
    if (p.params['camera.specs']) keyParams.push(`Camera: ${p.params['camera.specs']}`);
    if (p.params['misc.price']) keyParams.push(`Price: ${p.params['misc.price']}`);
    if (p.params['memory.internal']) keyParams.push(`Memory: ${p.params['memory.internal']}`);
    return {
      name: p.name,
      keySpecs: keyParams.join(', '),
      paramCount: Object.keys(p.params).length,
    };
  });

  return JSON.stringify({
    category,
    priceRange,
    market,
    products: productSummaries,
    instruction:
      'Based on these products, recommend the top 3-5 competitors that are most relevant for comparison. Consider price range, market positioning, and spec completeness. Return your recommendation as a JSON array with fields: name, rationale, keyParams (object with 4-5 most important param key-value pairs).',
  });
}

// ─── Tool Definitions ───────────────────────────────────────────

const searchProductsTool: AgentToolDef = {
  definition: {
    name: 'search_products',
    description:
      'Search for mobile phone products matching a query. Scrapes GSMArena, 91mobiles, etc. to find product names and URLs. Returns a list of matching products.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Search query, e.g. "Redmi Note 14 Pro" or "mid-range phone 15000"',
        },
        market: {
          type: 'string',
          description: 'Target market, e.g. "India", "印度"',
        },
      },
      required: ['query', 'market'],
    },
  },
  handler: handleSearchProducts,
};

const scrapeSpecsTool: AgentToolDef = {
  definition: {
    name: 'scrape_specs',
    description:
      'Scrape detailed phone specifications for a specific device. Fetches data from GSMArena, 91mobiles, TechSpecs, CellKaro and merges into structured params.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deviceName: {
          type: 'string',
          description: 'Full device name, e.g. "Samsung Galaxy A55 5G"',
        },
        market: {
          type: 'string',
          description: 'Target market for price context, e.g. "India"',
        },
      },
      required: ['deviceName'],
    },
  },
  handler: handleScrapeSpecs,
};

const recommendCompetitorsTool: AgentToolDef = {
  definition: {
    name: 'recommend_competitors',
    description:
      'Analyze a list of found products and recommend the top 3-5 most relevant competitors for comparison. Uses product specs, price range, and market positioning to make recommendations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Product category, e.g. "mid-range phone"',
        },
        priceRange: {
          type: 'string',
          description: 'Target price range, e.g. "₹15000" or "$200"',
        },
        market: {
          type: 'string',
          description: 'Target market, e.g. "India"',
        },
        foundProducts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              params: {
                type: 'object',
                additionalProperties: { type: 'string' },
              },
            },
            required: ['name', 'params'],
          },
          description: 'List of products with scraped specs to analyze',
        },
      },
      required: ['category', 'priceRange', 'market', 'foundProducts'],
    },
  },
  handler: handleRecommendCompetitors,
};

// ─── Agent Config ───────────────────────────────────────────────

export function getDiscoveryAgentConfig(locale: string): AgentRunnerConfig {
  const isZh = locale === 'zh';

  const systemPrompt = `You are a competitive intelligence agent for mobile phone market analysis.
Given product requirements (category, price range, market), your job is to:

1. Search for relevant competitor products using search_products
2. Scrape detailed specs for the most promising candidates using scrape_specs
3. Recommend the best 3-5 competitors to analyze using recommend_competitors

Strategy:
- Start by searching with the category + price range as the query
- If results are sparse, try alternative queries (brand names, specific models)
- Scrape specs for at least 5-8 candidates before making recommendations
- Handle search failures by trying alternative queries or different search terms
- Focus on products in the same price segment and market

After using recommend_competitors, format your final response as a JSON object:
{
  "competitors": [
    {
      "name": "Device Name",
      "params": { "platform.chipset": "...", "battery.type": "...", ... },
      "rationale": "Why this competitor matters"
    }
  ]
}

Be thorough and check multiple sources. ${isZh ? 'Respond in Chinese.' : 'Respond in English.'}`;

  return {
    systemPrompt,
    tools: [searchProductsTool, scrapeSpecsTool, recommendCompetitorsTool],
    maxIterations: 15,
    agentName: 'discovery',
  };
}
