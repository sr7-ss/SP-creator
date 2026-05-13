/**
 * Deep Research — Direct Pipeline (no agent loop)
 *
 * Step 1: Web search (Serper/Brave/Google) — code only, no LLM
 * Step 2: Single LLM call to analyze search results → JSON report
 *
 * This avoids tool_use entirely, which is unreliable on free models like zhipu glm-4-flash.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getBaseUrl, type AgentContext, type AgentResult, type AgentRunnerConfig } from '@/lib/ai/agent-runner';
import { logTrackedCall } from '@/lib/ai/track-call';

// Re-export for backward compatibility
export type { AgentRunnerConfig };

// ─── Types ──

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ─── Blocked domains ──

const BLOCKED_DOMAINS = new Set([
  'flipkart.com', 'amazon.in', 'amazon.com', 'jd.com', 'myntra.com', 'snapdeal.com',
]);

function isBlockedDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    return Array.from(BLOCKED_DOMAINS).some(d => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

// ─── Web Search ──

async function webSearch(query: string, count = 8): Promise<SearchResult[]> {
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    const results = await serperSearch(query, count, serperKey);
    if (results.length > 0) return results;
  }

  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    const results = await braveSearch(query, count, braveKey);
    if (results.length > 0) return results;
  }

  if (!serperKey && !braveKey) {
    console.warn('No search API key! Set SERPER_API_KEY in .env');
  }
  return googleFallbackSearch(query, count);
}

async function serperSearch(query: string, count: number, apiKey: string): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: Math.min(count, 20) }),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic || []).map((item: { title?: string; link?: string; snippet?: string }) => ({
      title: item.title || '', url: item.link || '', snippet: item.snippet || '',
    }));
  } catch { return []; }
  finally { clearTimeout(timer); }
}

async function braveSearch(query: string, count: number, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, count: String(Math.min(count, 20)), text_decorations: 'false' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.web?.results || []).map((item: { title?: string; url?: string; description?: string }) => ({
      title: item.title || '', url: item.url || '', snippet: item.description || '',
    }));
  } catch { return []; }
  finally { clearTimeout(timer); }
}

async function googleFallbackSearch(query: string, count: number): Promise<SearchResult[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${count}&hl=en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: SearchResult[] = [];
    const linkPattern = /href="\/url\?q=(https?:\/\/[^&"]+)/g;
    let match;
    while ((match = linkPattern.exec(html)) !== null && results.length < count) {
      const u = decodeURIComponent(match[1]);
      if (!u.includes('google.com')) {
        results.push({ title: new URL(u).hostname, url: u, snippet: '' });
      }
    }
    return results;
  } catch { return []; }
  finally { clearTimeout(timer); }
}

// ─── Page fetch (for non-blocked tech review sites) ──

async function fetchPage(url: string): Promise<string> {
  if (isBlockedDomain(url)) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
    });
    if (!res.ok) return '';
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim();
    if (text.length < 500 && /captcha|robot|verify|challenge|cloudflare/i.test(text)) return '';
    return text.slice(0, 8000);
  } catch { return ''; }
  finally { clearTimeout(timer); }
}

// ─── Query Builder ──

/**
 * Convert Chinese/mixed user input into an English search query.
 * "搜索vivo t4x在印度电商平台flipkart的用户评论" → "vivo t4x flipkart user reviews India"
 */
function buildSearchQuery(input: string): string {
  // Extract product name (English alphanumeric words)
  const productMatch = input.match(/([a-zA-Z][\w\s\-+.]*[a-zA-Z0-9])/i);
  const product = productMatch ? productMatch[1].trim() : '';

  // Detect platform mentions
  const platforms: string[] = [];
  if (/flipkart/i.test(input)) platforms.push('flipkart');
  if (/amazon/i.test(input)) platforms.push('amazon');
  if (/jd|京东/i.test(input)) platforms.push('jd.com');
  if (/淘宝|taobao/i.test(input)) platforms.push('taobao');

  // Detect market
  let market = '';
  if (/印度|india/i.test(input)) market = 'India';
  if (/中国|china/i.test(input)) market = 'China';

  // Detect intent
  const isReview = /评论|评测|反馈|review|opinion|feedback|痛点|关注/i.test(input);
  const isCompare = /对比|比较|竞品|compare|competitor|vs/i.test(input);
  const isTrend = /趋势|trend|需求/i.test(input);

  const parts = [product];
  if (platforms.length > 0) parts.push(platforms.join(' '));
  if (market) parts.push(market);
  if (isReview) parts.push('user reviews');
  else if (isCompare) parts.push('vs comparison');
  else if (isTrend) parts.push('market trends');
  else parts.push('reviews');

  const query = parts.filter(Boolean).join(' ');
  return query || input; // fallback to original if parsing fails
}

// ─── Direct Research Pipeline ──

export async function runResearchPipeline(
  context: AgentContext,
  userMessage: string,
  documentText?: string,
): Promise<AgentResult> {
  const zh = context.locale === 'zh';
  const send = context.onProgress;

  // === Step 1: Web Search (code, no LLM) ===
  const searchQuery = buildSearchQuery(userMessage);
  console.log(`[Research] User: "${userMessage.slice(0, 60)}" → Search: "${searchQuery}"`);

  send({
    step: 'search',
    detail: zh ? `正在搜索「${searchQuery}」...` : `Searching "${searchQuery}"...`,
    progress: 0.05,
  });

  const searchResults = await webSearch(searchQuery, 10);

  if (searchResults.length === 0) {
    // Fallback: try with just the product name + reviews
    const productMatch = userMessage.match(/(?:搜索|研究|分析|对比)?\s*([a-zA-Z0-9][\w\s\-+.]+[a-zA-Z0-9])/i);
    if (productMatch) {
      const fallbackQuery = `${productMatch[1].trim()} user reviews`;
      send({
        step: 'search',
        detail: zh ? `未找到结果，尝试「${fallbackQuery}」...` : `No results, trying "${fallbackQuery}"...`,
        progress: 0.1,
      });
      const retry = await webSearch(fallbackQuery, 10);
      if (retry.length > 0) searchResults.push(...retry);
    }
  }

  if (searchResults.length === 0) {
    send({ step: 'search', detail: zh ? '搜索无结果' : 'No results found', progress: 0.15 });
    return { success: false, summary: zh ? '搜索无结果，请检查网络或调整关键词' : 'No search results. Check network or adjust keywords.', data: {} };
  }

  const validSnippets = searchResults.filter(r => r.snippet.length > 20);
  send({
    step: 'search',
    detail: zh
      ? `找到 ${searchResults.length} 条结果，${validSnippets.length} 条含摘要`
      : `Found ${searchResults.length} results, ${validSnippets.length} with snippets`,
    progress: 0.2,
  });

  // Build data from snippets
  const snippetData = validSnippets
    .map(r => `[${r.title}] ${r.snippet}`)
    .join('\n\n');

  // Try to fetch review pages for richer data (tech sites + general review pages)
  const techSites = searchResults.filter(r =>
    /gsmarena|91mobiles|notebookcheck|smartprix|indiatoday|gadgets360|digit\.in|techradar|tomsguide|phonearena/i.test(r.url)
  ).slice(0, 3);

  // Also try non-blocked general pages that look like reviews
  const reviewPages = searchResults.filter(r =>
    !techSites.some(t => t.url === r.url) &&
    !isBlockedDomain(r.url) &&
    /review|评测|评论|opinion|hands.?on|experience/i.test(r.title + r.snippet)
  ).slice(0, 2);

  const pagesToFetch = [...techSites, ...reviewPages];
  let pageData = '';
  let fetchedCount = 0;

  if (pagesToFetch.length > 0) {
    send({
      step: 'fetch',
      detail: zh
        ? `准备抓取 ${pagesToFetch.length} 个页面...`
        : `Preparing to fetch ${pagesToFetch.length} pages...`,
      progress: 0.25,
    });

    // Fetch pages sequentially with per-page progress
    const pageTexts: string[] = [];
    for (let i = 0; i < pagesToFetch.length; i++) {
      const site = pagesToFetch[i];
      let hostname: string;
      try { hostname = new URL(site.url).hostname.replace('www.', ''); } catch { hostname = site.url.slice(0, 30); }

      send({
        step: 'fetch',
        detail: zh
          ? `正在抓取第 ${i + 1}/${pagesToFetch.length} 页 ${hostname}...`
          : `Fetching page ${i + 1}/${pagesToFetch.length}: ${hostname}...`,
        progress: 0.25 + (i / pagesToFetch.length) * 0.2,
      });

      const text = await fetchPage(site.url);
      if (text.length > 200) {
        pageTexts.push(text.slice(0, 4000));
        fetchedCount++;
      }
    }
    pageData = pageTexts.join('\n\n---\n\n');

    send({
      step: 'fetch',
      detail: zh
        ? `成功获取 ${fetchedCount}/${pagesToFetch.length} 个页面`
        : `Fetched ${fetchedCount}/${pagesToFetch.length} pages successfully`,
      progress: 0.5,
    });
  }

  const totalSources = validSnippets.length + fetchedCount + (documentText ? 1 : 0);
  let allData = snippetData + (pageData ? '\n\n--- FULL REVIEWS ---\n\n' + pageData : '');

  // Append uploaded document content if provided
  if (documentText) {
    allData += `\n\n--- UPLOADED DOCUMENT ---\n\n${documentText.slice(0, 15000)}`;
    send({
      step: 'document',
      detail: zh ? '已加载上传文档内容' : 'Uploaded document content loaded',
      progress: 0.52,
    });
  }

  const sources = searchResults.map(r => ({ url: r.url, type: 'search', snippetCount: 1 }));

  // === Step 2: Single LLM call to generate JSON report (no tool_use) ===
  send({
    step: 'analyze',
    detail: zh
      ? `AI 正在分析 ${totalSources} 条数据源，提取优缺点...`
      : `AI analyzing ${totalSources} sources, extracting pros & cons...`,
    progress: 0.55,
  });

  const jsonTemplate = `{
  "summary": "一句话总结",
  "topPros": [
    {"rank": 1, "topic": "电池续航", "mentionRate": "8/12", "finding": "一句话总结", "quotes": ["用户原话1", "用户原话2"]},
    {"rank": 2, "topic": "...", "mentionRate": "N/M", "finding": "...", "quotes": ["...", "..."]}
  ],
  "topCons": [
    {"rank": 1, "topic": "拍照夜景", "mentionRate": "5/12", "finding": "一句话总结", "quotes": ["用户原话1", "用户原话2"]},
    {"rank": 2, "topic": "...", "mentionRate": "N/M", "finding": "...", "quotes": ["...", "..."]}
  ],
  "kspRecommendations": ["建议1", "建议2", "建议3"]
}`;

  const totalSnippets = totalSources;

  const prompt = zh
    ? `以下是关于某产品的用户评论搜索数据（共 ${totalSnippets} 条有效来源）。请分析这些数据，统计用户最常提及的优点和缺点，输出 JSON 报告。

## 搜索结果数据
${allData.slice(0, 6000)}

## 输出要求
- topPros: 最多提及的 5 个优点，按频率排序
- topCons: 最多提及的 5 个缺点，按频率排序
- mentionRate: 格式为 "N/${totalSnippets}"，N 是在上面 ${totalSnippets} 条数据源中实际提及该话题的条数。仔细数，不要编造
- quotes: 必须从上面的搜索数据中摘录 2-3 条真实用户原话（英文原文即可）
- finding: 一句话总结该话题的用户反馈

请只输出 JSON，不要输出其他内容：
${jsonTemplate}`
    : `Below are user review search results for a product (${totalSnippets} valid sources). Analyze this data, count the most mentioned pros and cons, output a JSON report.

## Search Results
${allData.slice(0, 6000)}

## Output Requirements
- topPros: Top 5 most mentioned pros, ranked by frequency
- topCons: Top 5 most mentioned cons, ranked by frequency
- mentionRate: Format "N/${totalSnippets}" where N is the count of sources (out of ${totalSnippets}) that actually mention this topic. Count carefully, do not fabricate
- quotes: MUST be extracted from the search data above, 2-3 real user quotes each
- finding: One sentence summary of user feedback on this topic

Output ONLY JSON, nothing else:
${jsonTemplate}`;

  const baseUrl = getBaseUrl(context.provider);
  const client = new Anthropic({
    apiKey: context.apiKey,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  });

  let reportJson: Record<string, unknown> | null = null;
  let rawText = '';
  const callStartedAt = Date.now();

  try {
    const aiCall = client.messages.create({
      model: context.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI timed out')), 60000)
    );

    const response = await Promise.race([aiCall, timeout]);
    const textBlock = response.content.find(b => b.type === 'text');
    rawText = textBlock ? (textBlock as Anthropic.TextBlock).text : '';

    console.log(`[Research] AI response length: ${rawText.length}, first 200: ${rawText.slice(0, 200)}`);

    void logTrackedCall({
      userId: context.userId,
      action: 'ai_agent_research',
      provider: context.provider,
      model: response.model || context.model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      durationMs: Date.now() - callStartedAt,
      status: 'success',
    });

    send({
      step: 'analyze',
      detail: zh ? `AI 返回 ${rawText.length} 字，正在解析...` : `AI returned ${rawText.length} chars, parsing...`,
      progress: 0.85,
    });

    // Parse JSON from response
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) || rawText.match(/(\{[\s\S]*"topPros"[\s\S]*\})/);
    if (jsonMatch) {
      reportJson = JSON.parse(jsonMatch[1].trim());
    } else {
      // Try parsing the entire response as JSON
      reportJson = JSON.parse(rawText.trim());
    }
  } catch (e) {
    const errMsg = (e as Error).message;
    console.error('[Research] AI call or JSON parse failed:', errMsg);
    void logTrackedCall({
      userId: context.userId,
      action: 'ai_agent_research',
      provider: context.provider,
      model: context.model,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - callStartedAt,
      status: 'failure',
      errorMsg: errMsg,
    });
  }

  if (reportJson) {
    const prosCount = (reportJson.topPros as unknown[])?.length || 0;
    const consCount = (reportJson.topCons as unknown[])?.length || 0;
    console.log(`[Research] Parsed report: pros=${prosCount} cons=${consCount}`);

    send({
      step: 'done',
      detail: zh
        ? `报告完成：${prosCount} 个优点、${consCount} 个缺点，来自 ${totalSources} 条数据源`
        : `Report done: ${prosCount} pros, ${consCount} cons from ${totalSources} sources`,
      progress: 1.0,
    });

    return {
      success: true,
      summary: (reportJson.summary as string) || 'Report generated.',
      data: { report: { ...reportJson, sources }, sources },
    };
  }

  // Fallback: return raw text as summary with empty report structure so frontend shows it
  console.log(`[Research] No JSON parsed, returning text summary. rawText length: ${rawText.length}`);
  send({
    step: 'done',
    detail: zh ? '报告生成完成（文本格式）' : 'Report done (text format)',
    progress: 1.0,
  });
  return {
    success: true,
    summary: rawText || (zh ? '报告生成完成' : 'Report generated.'),
    data: {
      report: { summary: rawText, topPros: [], topCons: [], kspRecommendations: [], sources },
      sources,
    },
  };
}

// ─── Legacy Agent Config (kept for backward compat but not used in pipeline) ──

export function getResearchAgentConfig(locale: string): AgentRunnerConfig {
  return {
    systemPrompt: '',
    tools: [],
    maxIterations: 1,
  };
}
