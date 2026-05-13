/**
 * Rule-based text parser for product parameter extraction.
 * Attempts to parse structured product comparison text (tables, lists)
 * without calling AI. Returns null if parsing fails (fallback to AI).
 */

import { DEFAULT_PARAM_ROWS } from '@/lib/constants/param-weights';

interface ParsedProduct {
  name: string;
  isOwnProduct: boolean;
  params: Record<string, string>;
}

/** Keywords to identify each param key from row headers.
 *  Maps to NEW dot-notation keys as primary target. */
const PARAM_KEYWORDS: Record<string, string[]> = {
  // Display
  'display.type': ['display type', 'panel', '屏幕类型', '面板', '类型'],
  'display.size': ['screen size', 'screen', 'display', '屏幕尺寸', '屏幕大小', '屏幕', '屏'],
  'display.resolution': ['resolution', 'ppi', '分辨率', '像素密度'],
  'display.protection': ['protection', 'glass', '屏幕保护', '玻璃'],

  // Platform
  'platform.chipset': ['chipset', 'chip', 'processor', 'soc', '芯片', '处理器', '平台'],
  'platform.cpu': ['cpu detail', 'core', 'cpu详情', '核心'],
  'platform.gpu': ['gpu'],

  // Memory
  'memory.internal': ['memory', 'ram', 'rom', 'storage', 'internal', '内存', '存储'],
  'memory.type': ['ufs', 'emmc', '存储类型'],

  // Camera
  'camera.specs': ['rear camera', 'rear primary', 'main camera', 'rear secondary', 'secondary', '后摄', '后置', '主摄', '后置摄像', '副摄', '后置副'],
  'camera.video': ['rear video', '后置视频', 'video'],
  'selfie.specs': ['front camera', 'selfie', 'front', '前摄', '前置', '自拍'],
  'selfie.video': ['selfie video', 'front video', '前摄视频'],

  // Battery
  'battery.type': ['battery', 'capacity', '电池', '容量', '续航'],
  'battery.charging': ['charging', 'charge', 'fast charge', '充电', '快充'],

  // Body
  'body.dimensions': ['dimensions', 'thickness', '尺寸', '厚度'],
  'body.weight': ['weight', '重量', '克'],
  'body.build': ['build', 'material', '材质', '机身材质'],
  'body.protection': ['water', 'dust', 'ip rating', 'ip6', 'ip5', 'ip4', 'mil-std', 'durability', '防水', '防尘', '防护'],
  'body.colors': ['color', 'colours', '颜色', '配色'],

  // Software
  'software.os': ['operating system', 'android', 'ios', '操作系统', '系统'],

  // Misc — catch-all for unmatched specs
  'misc.others': ['speaker', 'loudspeaker', 'dual speaker', 'cooling', 'vc liquid', 'finger', 'fingerprint', '散热', '扬声器', '喇叭', '指纹', '液冷'],
  'misc.nfc': ['nfc'],
  'misc.price': ['price', '价格', '售价', '定价'],
  'misc.launchDate': ['launch', 'launch date', 'release', 'released', 'release date', 'announced', 'available', 'availability', '上市', '发布', '发售', '上市时间', '发布时间', '发布日期', '发售日期'],
};

/** Legacy flat key → new key mapping for backward compatibility during text parsing */
const LEGACY_KEYWORD_MAP: Record<string, string[]> = {
  'platform.chipset': ['chipset', '芯片'],
  'battery.type': ['battery', '电池'],
  'camera.specs': ['camera', '摄', '影像'],
  'memory.internal': ['memory', '内存+存储'],
  'body.protection': ['durability', '防护'],
  'misc.price': ['price', '价格'],
};

/**
 * Try to match a row header to a standard param key.
 */
function matchParamKey(header: string): string | null {
  const h = header.toLowerCase().trim();

  // Try new dot-notation keywords first (more specific)
  for (const [key, keywords] of Object.entries(PARAM_KEYWORDS)) {
    for (const kw of keywords) {
      if (h.includes(kw)) return key;
    }
  }

  // Try legacy broad keywords
  for (const [key, keywords] of Object.entries(LEGACY_KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (h.includes(kw)) return key;
    }
  }

  // Try matching against DEFAULT_PARAM_ROWS (flat list with nameEn/nameZh)
  for (const row of DEFAULT_PARAM_ROWS) {
    if (
      h.includes(row.key.toLowerCase()) ||
      h.includes(row.nameEn.toLowerCase()) ||
      h.includes(row.nameZh)
    ) {
      return row.key;
    }
  }
  return null;
}

/**
 * Match a VALUE string (not label) to a param key by recognizing patterns.
 * Used when the label doesn't match but the value clearly belongs to a field.
 */
function matchValueToKey(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  // IP rating → body.protection
  if (/\bIP\d{2}\b/i.test(v)) return 'body.protection';
  if (/\bMIL-STD/i.test(v)) return 'body.protection';

  // Hz → display.type (display info)
  if (/\d+\s*Hz/i.test(v) && !(/\d+\s*mAh/i.test(v))) return 'display.type';

  // nits → display.type
  if (/\d+\s*nits/i.test(v)) return 'display.type';

  // Display resolution patterns: "1080 x 2408", "FHD+", "2K"
  if (/\d+\s*x\s*\d+\s*pixel/i.test(v) || /\bFHD\+?\b|\bQHD\+?\b|\b2K\b|\b1080p\b/i.test(v)) return 'display.resolution';

  // inches → display.size
  if (/[\d.]+\s*inch/i.test(v)) return 'display.size';

  // Chipset names: Dimensity, Snapdragon, Exynos, Helio, Tensor, A1x, Kirin
  if (/\b(Dimensity|Snapdragon|Exynos|Helio|Tensor|Kirin|Unisoc|天玑|骁龙|麒麟)\b/i.test(v)) return 'platform.chipset';

  // Octa-core / Quad-core → platform.cpu
  if (/\b(Octa|Quad|Hexa|Deca)-?core\b/i.test(v)) return 'platform.cpu';

  // GPU names: Mali, Adreno, Immortalis
  if (/\b(Mali|Adreno|Immortalis|PowerVR)\b/i.test(v)) return 'platform.gpu';

  // RAM+ROM patterns: "8+256", "8GB+256GB", "12/256"
  if (/\d+\s*[+\/]\s*\d+\s*(GB)?/i.test(v) && /\d{2,}/.test(v)) return 'memory.internal';
  if (/\b\d+\s*GB\s*(RAM|ROM|\+)/i.test(v)) return 'memory.internal';

  // UFS/eMMC → memory.type
  if (/\b(UFS|eMMC|LPDDR)\b/i.test(v)) return 'memory.type';

  // VC / liquid cooling / mm² → misc.others
  if (/\bVC\b|liquid\s*cool|散热|mm²|mm2/i.test(v)) return 'misc.others';

  // Fingerprint / finger → misc.others
  if (/finger|指纹/i.test(v)) return 'misc.others';

  // Speaker → misc.others
  if (/speaker|扬声器|喇叭/i.test(v)) return 'misc.others';

  // mAh → battery.type
  if (/\d+\s*mAh/i.test(v)) return 'battery.type';

  // W (charging) → battery.charging — more flexible pattern
  if (/\d+\s*[wW]\s*(快充|充电|charging)?/i.test(v) && v.length < 20) return 'battery.charging';

  // MP → camera.specs
  if (/\d+\s*(?:MP|M|万)\b/i.test(v) && v.length < 40) return 'camera.specs';

  // Weight: xxxg
  if (/^\d+\.?\d*\s*g$/i.test(v)) return 'body.weight';

  // Dimensions: xxx x xxx x xxx mm
  if (/[\d.]+\s*x\s*[\d.]+\s*x\s*[\d.]+\s*mm/i.test(v)) return 'body.dimensions';

  // Android version
  if (/\bAndroid\s*\d+/i.test(v)) return 'software.os';

  // NFC
  if (/^\s*NFC\s*$/i.test(v) || /\bNFC\b.*支持/i.test(v) || /支持.*\bNFC\b/i.test(v)) return 'misc.nfc';

  // Price: ₹xxx, $xxx, ¥xxx or pure number > 1000
  if (/[₹$€£¥]\s*[\d,]+/.test(v)) return 'misc.price';

  // Launch date patterns: "2024-01", "January 2024", "2024年1月", "Q1 2024", "2024/01/15", "Released 2024"
  if (/\b20\d{2}[-/年]\d{1,2}/i.test(v)) return 'misc.launchDate';
  if (/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}/i.test(v)) return 'misc.launchDate';
  if (/\bQ[1-4]\s+20\d{2}/i.test(v)) return 'misc.launchDate';
  if (/\b20\d{2}年\d{1,2}月/i.test(v)) return 'misc.launchDate';

  return null;
}

/**
 * Detect separator used in text (tab, |, multiple spaces).
 */
function detectSeparator(line: string): RegExp | null {
  if (line.includes('\t')) return /\t+/;
  if (line.includes('|')) return /\s*\|\s*/;
  if (/\s{3,}/.test(line)) return /\s{3,}/;
  return null;
}

/**
 * Debug info returned alongside parse result.
 */
export interface ParseDebugInfo {
  lines: number;
  separator: string | null;
  tableProducts: number;
  tableMatchedParams: number;
  singleTabParams: number;
  singleColonParams: number;
  singleKwParams: number;
  singleValueParams: number;
  /** First few unmatched lines for diagnostics */
  unmatchedSamples: string[];
}

/**
 * Attempt to parse product comparison text into structured data.
 * Supports table formats: tab-separated, pipe-separated, space-separated.
 *
 * Returns null if the text cannot be reliably parsed.
 * When debug is provided, fills it with diagnostics about each parse stage.
 */
export function parseProductsFromText(text: string, debug?: ParseDebugInfo): ParsedProduct[] | null {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  if (debug) {
    debug.lines = lines.length;
    debug.separator = null;
    debug.tableProducts = 0;
    debug.tableMatchedParams = 0;
    debug.singleTabParams = 0;
    debug.singleColonParams = 0;
    debug.singleKwParams = 0;
    debug.singleValueParams = 0;
    debug.unmatchedSamples = [];
  }

  if (lines.length < 2) {
    // Try single-line value parsing for very short input
    return parseSingleProductFromText(text, debug);
  }

  let sep: RegExp | null = null;
  let sepName: string | null = null;
  for (const line of lines.slice(0, 5)) {
    sep = detectSeparator(line);
    if (sep) {
      sepName = line.includes('\t') ? 'tab' : line.includes('|') ? 'pipe' : 'spaces';
      break;
    }
  }
  if (debug) debug.separator = sepName;

  if (!sep) {
    // No table separator found — try single-product parsers
    return parseSingleProductFromText(text, debug);
  }

  const rows = lines.map((line) => line.split(sep!).map((c) => c.trim()).filter(Boolean));

  let headerIdx = 0;
  let maxCols = 0;
  for (let i = 0; i < Math.min(rows.length, 3); i++) {
    if (rows[i].length > maxCols) {
      maxCols = rows[i].length;
      headerIdx = i;
    }
  }

  const header = rows[headerIdx];
  if (header.length < 2) {
    return parseSingleProductFromText(text, debug);
  }

  const firstColIsLabel = matchParamKey(header[0]) !== null ||
    ['参数', 'param', 'spec', '规格', ''].includes(header[0].toLowerCase());

  const productStartCol = firstColIsLabel ? 1 : 0;
  const productNames = header.slice(productStartCol);
  if (productNames.length < 1) {
    return parseSingleProductFromText(text, debug);
  }

  const products: ParsedProduct[] = productNames.map((name, idx) => ({
    name,
    isOwnProduct: idx === 0,
    params: {},
  }));

  let matchedParams = 0;
  const unmatchedLabels: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (i === headerIdx) continue;
    const row = rows[i];
    if (row.length < 2) continue;

    const labelCell = firstColIsLabel ? row[0] : '';
    let paramKey = matchParamKey(labelCell);

    // If label doesn't match, try detecting from the first value cell
    if (!paramKey) {
      const firstVal = row[firstColIsLabel ? 1 : 0] || '';
      paramKey = matchValueToKey(firstVal);
    }
    if (!paramKey) {
      if (labelCell && unmatchedLabels.length < 5) unmatchedLabels.push(labelCell);
      continue;
    }

    matchedParams++;
    const valueStartCol = firstColIsLabel ? 1 : 0;
    for (let j = 0; j < products.length; j++) {
      const val = row[valueStartCol + j];
      if (val) {
        if (paramKey === 'misc.others' && products[j].params[paramKey]) {
          products[j].params[paramKey] += ' / ' + val;
        } else {
          products[j].params[paramKey] = val;
        }
      }
    }
  }

  if (debug) {
    debug.tableProducts = products.length;
    debug.tableMatchedParams = matchedParams;
    debug.unmatchedSamples = unmatchedLabels;
  }

  // Multi-product mode: need 2+ products with 2+ params
  if (products.length >= 2 && matchedParams >= 2) {
    const productsWithData = products.filter(
      (p) => Object.keys(p.params).length >= 2
    );
    if (productsWithData.length >= 2) return productsWithData;
  }

  // Single product with data — return if has params
  if (matchedParams >= 2) {
    const best = products.reduce((a, b) =>
      Object.keys(a.params).length >= Object.keys(b.params).length ? a : b
    );
    if (Object.keys(best.params).length >= 2) {
      return postProcessSingleProduct(best.params);
    }
  }

  // Fall through to single-product parsers
  return parseSingleProductFromText(text, debug);
}

/**
 * Parse a single product's spec list (e.g., copied from GSMArena).
 * Format: lines with tab-separated "Label\tValue" or "Category\tLabel\tValue".
 * Returns a single-element array with isOwnProduct=false (competitor).
 */
function parseSingleProductFromText(text: string, debug?: ParseDebugInfo): ParsedProduct[] | null {
  const tabResult = parseSingleProductTabSeparated(text);
  const tabCount = tabResult ? Object.keys(tabResult).length : 0;
  if (debug) debug.singleTabParams = tabCount;
  if (tabCount >= 2) return postProcessSingleProduct(tabResult!);

  const colonResult = parseSingleProductColonSeparated(text);
  const colonCount = colonResult ? Object.keys(colonResult).length : 0;
  if (debug) debug.singleColonParams = colonCount;
  if (colonCount >= 2) return postProcessSingleProduct(colonResult!);

  const kwResult = parseSingleProductByKeywords(text);
  const kwCount = kwResult ? Object.keys(kwResult).length : 0;
  if (debug) debug.singleKwParams = kwCount;
  if (kwCount >= 2) return postProcessSingleProduct(kwResult!);

  const valueResult = parseSingleProductByValuePatterns(text);
  const valueCount = valueResult ? Object.keys(valueResult).length : 0;
  if (debug) debug.singleValueParams = valueCount;
  if (valueCount >= 2) return postProcessSingleProduct(valueResult!);

  return null;
}

/**
 * Colon-separated key:value parser.
 * Handles formats like:
 *   芯片: Dimensity 7300
 *   电池：7000mAh
 *   charging: 45W
 * Supports both ASCII colon (:) and Chinese full-width colon (：).
 */
function parseSingleProductColonSeparated(text: string): Record<string, string> | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 1) return null;

  // Check if any lines have colon separators
  const colonPattern = /^(.+?)[：:]\s*(.+)$/;
  let colonLines = 0;
  for (const line of lines) {
    if (colonPattern.test(line)) colonLines++;
  }
  // Need at least 2 colon-separated lines, or >30% of lines
  if (colonLines < 2 && (lines.length < 2 || colonLines / lines.length < 0.3)) return null;

  const params: Record<string, string> = {};

  for (const line of lines) {
    const match = line.match(colonPattern);
    if (!match) continue;
    const label = match[1].trim();
    const value = match[2].trim();
    if (!value) continue;

    // Try matching the label to a param key
    let paramKey = matchParamKey(label);
    // If label doesn't match, try the value
    if (!paramKey) paramKey = matchValueToKey(value);
    if (!paramKey) continue;

    if (paramKey === 'misc.others' && params[paramKey]) {
      params[paramKey] += ' / ' + value;
    } else if (!params[paramKey]) {
      params[paramKey] = value;
    }
  }

  return Object.keys(params).length > 0 ? params : null;
}

/**
 * Value-pattern scanner: identifies params purely from value content.
 * Works when there are no clear labels or separators — just raw spec values.
 * Scans each line and each comma/space segment for recognizable patterns.
 */
function parseSingleProductByValuePatterns(text: string): Record<string, string> | null {
  const params: Record<string, string> = {};
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Also try splitting by commas and Chinese commas for single-line input
  const segments: string[] = [];
  for (const line of lines) {
    // Split by comma, Chinese comma, semicolon, or treat whole line
    const parts = line.split(/[,，;；]\s*/);
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed) segments.push(trimmed);
    }
  }

  for (const seg of segments) {
    // Try label:value first (for segments like "芯片: xxx")
    const colonMatch = seg.match(/^(.+?)[：:]\s*(.+)$/);
    if (colonMatch) {
      const label = colonMatch[1].trim();
      const value = colonMatch[2].trim();
      const key = matchParamKey(label) || matchValueToKey(value);
      if (key && value && !params[key]) {
        params[key] = value;
        continue;
      }
    }

    // Try matching the whole segment as a value
    const key = matchValueToKey(seg);
    if (key && !params[key]) {
      params[key] = seg;
      continue;
    }

    // Try label matching on the whole segment (e.g. "Dimensity 7300" → chipset)
    const labelKey = matchParamKey(seg);
    if (labelKey && !params[labelKey]) {
      params[labelKey] = seg;
    }
  }

  return Object.keys(params).length > 0 ? params : null;
}

/**
 * Tab-separated GSMArena format parser.
 */
function parseSingleProductTabSeparated(text: string): Record<string, string> | null {
  if (!text.includes('\t')) return null;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 5) return null;

  const params: Record<string, string> = {};
  let currentCategory = '';

  for (const line of lines) {
    const parts = line.split('\t').map(s => s.trim()).filter(Boolean);

    if (parts.length === 1) {
      const key = matchParamKey(parts[0]);
      if (key) currentCategory = parts[0].toLowerCase();
      continue;
    }

    if (parts.length >= 2) {
      let label: string;
      let value: string;

      if (parts.length >= 3) {
        const mid = parts[1].toLowerCase();
        if (['dual', 'single', 'triple', 'quad', 'penta'].includes(mid)) {
          label = parts[0];
          value = parts.slice(2).join(' ');
          if (label.toLowerCase().includes('main camera')) currentCategory = 'main camera';
          else if (label.toLowerCase().includes('selfie')) currentCategory = 'selfie camera';
        } else {
          label = `${parts[0]} ${parts[1]}`;
          value = parts.slice(2).join(' ');
        }
      } else {
        label = currentCategory ? `${currentCategory} ${parts[0]}` : parts[0];
        value = parts[1];
      }

      let key = matchParamKey(label);
      if (parts[0].toLowerCase() === 'video' || label.toLowerCase().includes('video')) {
        if (currentCategory?.includes('selfie')) key = 'selfie.video';
        else if (currentCategory?.includes('main camera') || currentCategory?.includes('camera')) key = 'camera.video';
      }

      if (key && value && !params[key]) {
        params[key] = value;
      }
    }
  }

  return Object.keys(params).length > 0 ? params : null;
}

/**
 * Keyword-based scanner for plain text (tabs lost during copy-paste).
 * Scans for known field names and captures the value after them.
 */
function parseSingleProductByKeywords(text: string): Record<string, string> | null {
  const params: Record<string, string> = {};

  // Known GSMArena field labels → param keys
  // Lookaheads use known next-section keywords to stop greedy capture
  const FIELD_PATTERNS: { pattern: RegExp; key: string }[] = [
    // Display — "Display Type IPS LCD, 120Hz, 1050 nits (HBM) Size 6.72 inches..."
    { pattern: /Display\s+Type\s+(.+?)(?=\s+Size\s+[\d])/i, key: 'display.type' },
    { pattern: /Size\s+([\d.]+ inches.+?)(?=\s+Resolution\s)/i, key: 'display.size' },
    { pattern: /Resolution\s+([\d]+ x [\d]+.+?)(?=\s+Platform\b)/i, key: 'display.resolution' },
    // Platform
    { pattern: /Chipset\s+(.+?)(?=\s+CPU\b)/i, key: 'platform.chipset' },
    { pattern: /\bCPU\s+(Octa-core.+?)(?=\s+GPU\b)/i, key: 'platform.cpu' },
    { pattern: /\bGPU\s+(.+?)(?=\s+Memory\b)/i, key: 'platform.gpu' },
    // Memory
    { pattern: /Internal\s+(.+?)(?=\s+(?:UFS|eMMC|Main Camera))/i, key: 'memory.internal' },
    { pattern: /\b(UFS\s*[\d.]+|eMMC\s*[\d.]+)/i, key: 'memory.type' },
    // Camera
    { pattern: /Main Camera\s+(?:Dual|Triple|Quad|Single|Penta)\s+(.+?)(?=\s+(?:Auxiliary|Features|Video)\b)/i, key: 'camera.specs' },
    { pattern: /Main Camera.+?Video\s+([\dK@fps, ]+?)(?=\s+Selfie)/i, key: 'camera.video' },
    { pattern: /Selfie camera\s+(?:Single|Dual)\s+(.+?)(?=\s+Video\b)/i, key: 'selfie.specs' },
    { pattern: /Selfie camera.+?Video\s+([\dK@fps, p]+?)(?=\s+Sound\b)/i, key: 'selfie.video' },
    // Battery
    { pattern: /Battery\s+Type\s+(.+?)(?=\s+Charging\b)/i, key: 'battery.type' },
    { pattern: /Charging\s+(.+?)(?=\s+(?:Reverse|Misc)\b)/i, key: 'battery.charging' },
    // Body
    { pattern: /Dimensions\s+([\d.]+ x [\d.]+ x [\d.]+ mm[^)]*\))/i, key: 'body.dimensions' },
    { pattern: /Weight\s+([\d]+ g[^)]*(?:\([^)]*\))?)/i, key: 'body.weight' },
    { pattern: /Build\s+(.+?)(?=\s+SIM\b)/i, key: 'body.build' },
    { pattern: /SIM\s+(.+?)(?=\s+IP\d)/i, key: 'body.sim' },
    { pattern: /(IP\d+[^*]*?)(?=\s*(?:\*|MIL))/i, key: 'body.protection' },
    { pattern: /(MIL-STD-\S+)/i, key: '_mil_std' },
    // Software
    { pattern: /\bOS\s+(Android\s+\d+.+?)(?=\s+Chipset\b)/i, key: 'software.os' },
    // Misc
    { pattern: /\bNFC\s+(Yes|No)\b/i, key: 'misc.nfc' },
    { pattern: /Colors\s+(.+?)(?=\s+Models\b)/i, key: 'misc.colors' },
    { pattern: /Price\s+(.+?)$/im, key: 'misc.price' },
  ];

  for (const { pattern, key } of FIELD_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const value = match[1].trim();
      if (!params[key]) {
        params[key] = value;
      }
    }
  }

  // Merge MIL-STD into protection
  if (params['_mil_std']) {
    params['body.protection'] = params['body.protection']
      ? params['body.protection'] + ', ' + params['_mil_std']
      : params['_mil_std'];
    delete params['_mil_std'];
  }

  // NFC special handling
  if (params['misc.nfc']?.toLowerCase() === 'no') {
    params['misc.nfc'] = '不支持';
  }

  return Object.keys(params).length > 0 ? params : null;
}

/**
 * Post-process and wrap params into ParsedProduct array.
 */
function postProcessSingleProduct(params: Record<string, string>): ParsedProduct[] {
  // Camera: strip "Dual", "Single" etc prefixes
  for (const camKey of ['camera.specs', 'selfie.specs']) {
    if (params[camKey]) {
      params[camKey] = params[camKey].replace(/^(Dual|Triple|Quad|Single|Penta)\s*/i, '').trim();
    }
  }

  // Battery: split type and charging
  if (params['battery.type'] && !params['battery.charging']) {
    const wMatch = params['battery.type'].match(/(\d+)\s*[wW]/);
    if (wMatch) {
      params['battery.charging'] = wMatch[1] + 'W';
      const cleanBat = params['battery.type'].replace(/[,;]\s*\d+\s*[wW].*$/i, '').trim();
      if (cleanBat) params['battery.type'] = cleanBat;
    }
  }

  // Weight: clean up oz
  if (params['body.weight']) {
    let w = params['body.weight'];
    w = w.replace(/\s*\([\d.]+\s*oz\)\s*/gi, '').trim();
    w = w.replace(/(\d+)\s*g/gi, '$1g');
    params['body.weight'] = w;
  }

  // Price: clean up
  if (params['misc.price']) {
    const priceNum = params['misc.price'].replace(/[₹$€£¥,\s]/g, '').match(/(\d+)/);
    if (priceNum) params['misc.price'] = priceNum[1];
  }

  // NFC
  if (params['misc.nfc']?.toLowerCase() === 'no') {
    params['misc.nfc'] = '不支持';
  }

  // Normalize separator: comma → " / " across all values
  normalizeValueSeparators(params);

  return [{
    name: '',
    isOwnProduct: true,
    params,
  }];
}

/**
 * Replace commas with " / " in all param values.
 * System-wide standard separator — consistent, non-deletable.
 */
function normalizeValueSeparators(params: Record<string, string>) {
  for (const key of Object.keys(params)) {
    if (!params[key]) continue;
    // Replace ", " or "," with " / " but skip inside parentheses like "(4 nm)"
    // and don't touch numbers like "1,080" or price "16,999"
    params[key] = params[key].replace(/,\s*/g, (match, offset, str) => {
      // Check if this comma is inside a number (digit before and after)
      const before = str[offset - 1];
      const afterChar = str[offset + match.length];
      if (before && /\d/.test(before) && afterChar && /\d/.test(afterChar)) {
        return match; // keep numeric commas like "1,080"
      }
      return ' / ';
    });
  }
}
