import { NextRequest, NextResponse } from 'next/server';
import { mapRawToParams, parseGSMArenaHtml, parse91mobilesHtml, parseCellKaroHtml, parseTechSpecsHtml } from '@/lib/analysis/spec-scraper';
import { PARAM_CATEGORIES } from '@/lib/constants/param-weights';
import { requireAuth, handleAuthError } from '@/lib/auth/session';

// Simple in-memory cache (1 hour TTL)
const cache = new Map<string, { data: Record<string, string>; source: string; sourceUrl: string; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000;

const totalFields = PARAM_CATEGORIES.reduce((sum, cat) => sum + cat.fields.length, 0);
const MIN_USEFUL_FIELDS = Math.floor(totalFields / 3); // At least 1/3 of fields to consider "good enough"

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Normalize device name for URL: "vivo T4x" → "vivo-t4x"
 * Also try fuzzy variants: "vivo T4x" → try "vivo T4x 5G", "vivo T4x 4G"
 */
function nameVariants(name: string): string[] {
  const base = name.trim();
  const variants = [base];

  // If doesn't already have 5G/4G/LTE suffix, add 5G variant
  if (!/\b(5G|4G|LTE)\b/i.test(base)) {
    variants.push(`${base} 5G`);
  }

  return variants;
}

function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

interface SourceConfig {
  name: string;
  getUrls: (deviceName: string) => string[];
  parse: (html: string) => Record<string, string>;
}

const SOURCES: SourceConfig[] = [
  {
    // Priority 1: GSMArena — most comprehensive, global coverage
    name: 'GSMArena',
    getUrls: (name) => {
      // GSMArena URL pattern: brand_model-id.php — hard to guess the ID
      // Use search results page instead
      const q = encodeURIComponent(name);
      return [`https://www.gsmarena.com/results.php3?sQuickSearch=yes&sName=${q}`];
    },
    parse: parseGSMArenaHtml,
  },
  {
    // Priority 2: 91mobiles — good for India market
    name: '91mobiles',
    getUrls: (name) => nameVariants(name).map(v => `https://www.91mobiles.com/${nameToSlug(v)}-price-in-india`),
    parse: parse91mobilesHtml,
  },
  {
    // Priority 3: CellKaro — India-specific
    name: 'CellKaro',
    getUrls: (name) => nameVariants(name).map(v => `https://www.cellkaro.com/mobiles/${nameToSlug(v)}/`),
    parse: parseCellKaroHtml,
  },
  {
    // Priority 4: TechSpecs — fallback
    name: 'TechSpecs.info',
    getUrls: (name) => nameVariants(name).map(v => `https://www.techspecs.info/${nameToSlug(v)}/`),
    parse: parseTechSpecsHtml,
  },
];

/**
 * Brand official spec page URLs by market
 */
const BRAND_OFFICIAL_URLS: Record<string, Record<string, (name: string) => string>> = {
  '印度': {
    vivo: (n) => `https://www.vivo.com/in/phones?q=${encodeURIComponent(n)}`,
    samsung: (n) => `https://www.samsung.com/in/smartphones/?q=${encodeURIComponent(n)}`,
    xiaomi: (n) => `https://www.mi.com/in/search?keyword=${encodeURIComponent(n)}`,
    realme: (n) => `https://www.realme.com/in/search?keyword=${encodeURIComponent(n)}`,
    oppo: (n) => `https://www.oppo.com/in/smartphones/?q=${encodeURIComponent(n)}`,
  },
};

function detectBrand(name: string): string | null {
  const lower = name.toLowerCase();
  const brands = ['vivo', 'samsung', 'xiaomi', 'realme', 'oppo', 'oneplus', 'redmi', 'poco', 'iqoo', 'honor'];
  return brands.find(b => lower.includes(b)) || null;
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const { deviceName, market } = await req.json();

    if (!deviceName || typeof deviceName !== 'string') {
      return NextResponse.json({ error: 'deviceName is required' }, { status: 400 });
    }

    const cacheKey = `${deviceName.toLowerCase().trim()}-${market || 'global'}`;

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const foundCount = Object.keys(cached.data).length;
      return NextResponse.json({
        specs: cached.data,
        source: cached.source,
        sourceUrl: cached.sourceUrl,
        foundCount,
        totalCount: totalFields,
        fromCache: true,
        sufficient: foundCount >= MIN_USEFUL_FIELDS,
      });
    }

    // Merged specs from all sources — first value wins per field
    const mergedSpecs: Record<string, string> = {};
    const sources: { name: string; url: string; count: number }[] = [];

    // Try ALL sources and merge results
    for (const src of SOURCES) {
      const urls = src.getUrls(deviceName);

      for (let url of urls) {
        try {
          let res = await fetch(url, {
            headers: FETCH_HEADERS,
            signal: AbortSignal.timeout(8000),
            redirect: 'follow',
          });

          if (!res.ok) continue;

          let html = await res.text();

          // GSMArena special: search page → extract first result detail URL → fetch it
          if (src.name === 'GSMArena' && url.includes('results.php3')) {
            const detailMatch = html.match(/<a\s+href="([^"]+\.php)"\s*>\s*<img/i)
              || html.match(/<a\s+href="([\w_]+-\d+\.php)"/i);
            if (detailMatch) {
              const detailUrl = `https://www.gsmarena.com/${detailMatch[1]}`;
              try {
                res = await fetch(detailUrl, {
                  headers: FETCH_HEADERS,
                  signal: AbortSignal.timeout(8000),
                });
                if (res.ok) {
                  html = await res.text();
                  url = detailUrl;
                }
              } catch {
                // detail fetch failed, use search page html
              }
            }
          }

          if (html.length < 2000) continue;

          const raw = src.parse(html);
          const specs = mapRawToParams(raw);
          const count = Object.keys(specs).length;

          if (count > 0) {
            sources.push({ name: src.name, url, count });
            // Merge: only fill in fields not yet found
            for (const [k, v] of Object.entries(specs)) {
              if (!mergedSpecs[k]) {
                mergedSpecs[k] = v;
              }
            }
          }

          // Found some results from this source, try next source (don't try more URL variants)
          if (count > 0) break;
        } catch {
          // This URL failed, try next
        }
      }
    }

    const bestSource = sources.length > 0 ? sources.map(s => s.name).join(' + ') : '';
    const bestSourceUrl = sources.length > 0 ? sources[0].url : '';
    const bestSpecs = mergedSpecs;

    // Cache result if we found anything
    if (Object.keys(bestSpecs).length > 0) {
      cache.set(cacheKey, { data: bestSpecs, source: bestSource, sourceUrl: bestSourceUrl, timestamp: Date.now() });
    }

    const foundCount = Object.keys(bestSpecs).length;
    const sufficient = foundCount >= MIN_USEFUL_FIELDS;

    // Build fallback links
    const allFieldKeys = PARAM_CATEGORIES.flatMap(cat => cat.fields.map(f => f.key));
    const missingFields = allFieldKeys.filter(k => !bestSpecs[k]);

    // Generate fallback links for manual lookup
    const fallbackLinks: { name: string; url: string }[] = [];

    // Brand official site
    const brand = detectBrand(deviceName);
    if (brand && market && BRAND_OFFICIAL_URLS[market]?.[brand]) {
      fallbackLinks.push({
        name: `${brand.charAt(0).toUpperCase() + brand.slice(1)} ${market}官网`,
        url: BRAND_OFFICIAL_URLS[market][brand](deviceName),
      });
    }

    // Universal spec sites
    fallbackLinks.push(
      { name: 'GSMArena', url: `https://www.gsmarena.com/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(deviceName)}` },
      { name: '91mobiles', url: `https://www.91mobiles.com/search?q=${encodeURIComponent(deviceName)}` },
    );

    return NextResponse.json({
      specs: bestSpecs,
      source: bestSource,
      sourceUrl: bestSourceUrl,
      foundCount,
      totalCount: totalFields,
      missingFields,
      sufficient,
      fallbackLinks,
    });
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    console.error('Competitor specs error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch specs' },
      { status: 500 }
    );
  }
}
