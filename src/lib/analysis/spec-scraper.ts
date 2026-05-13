/**
 * Spec scraper: fetches and parses phone specifications from web sources.
 * Maps raw spec labels to dot-notation param keys.
 */

/** Fields the user explicitly marked as "不要" — skip these */
const SKIP_FIELDS = new Set([
  'hdr', '5g bands', '5g', 'wifi', 'wlan', 'bluetooth',
  'infrared', 'ir', 'usb', 'sensors', 'sensor',
]);

/** Mapping from raw spec labels (lowercase) → dot-notation param keys */
const LABEL_TO_KEY: Record<string, string> = {
  // Display
  'screen size': 'display.size',
  'display size': 'display.size',
  'screen': 'display.size',
  'size': 'display.size',
  'display type': 'display.type',
  'screen type': 'display.type',
  'type': 'display.type',
  'resolution': 'display.resolution',
  'ppi': 'display.resolution',
  'pixel density': 'display.resolution',
  'protection': 'display.protection',
  'screen protection': 'display.protection',

  // Platform
  'processor': 'platform.chipset',
  'processor (soc)': 'platform.chipset',
  'chipset': 'platform.chipset',
  'soc': 'platform.chipset',
  'cpu': 'platform.cpu',
  'cpu cores': 'platform.cpu',
  'cpu details': 'platform.cpu',
  'gpu': 'platform.gpu',

  // Memory
  'memory': 'memory.internal',
  'internal': 'memory.internal',
  'ram': 'memory.internal',
  'storage': 'memory.internal',
  'storage type': 'memory.type',
  'ufs': 'memory.type',
  'emmc': 'memory.type',

  // Camera
  'rear primary': 'camera.specs',
  'rear camera': 'camera.specs',
  'main camera': 'camera.specs',
  'rear type': 'camera.specs',
  'rear secondary': 'camera.specs',
  'dual': 'camera.specs',
  'triple': 'camera.specs',
  'quad': 'camera.specs',
  'rear video': 'camera.video',

  // Selfie
  'front primary': 'selfie.specs',
  'front camera': 'selfie.specs',
  'selfie camera': 'selfie.specs',
  'selfie': 'selfie.specs',
  'single': 'selfie.specs',
  'selfie video': 'selfie.video',
  'front video': 'selfie.video',

  // Battery
  'capacity': 'battery.type',
  'battery': 'battery.type',
  'battery capacity': 'battery.type',
  'battery type': 'battery.type',
  'charging': 'battery.charging',
  'fast charging': 'battery.charging',

  // Body
  'dimensions': 'body.dimensions',
  'weight': 'body.weight',
  'build': 'body.build',
  'body build': 'body.build',
  'body material': 'body.build',
  'material': 'body.build',
  'sim': 'body.sim',
  'water & dust resistance': 'body.protection',
  'water resistance': 'body.protection',
  'ip rating': 'body.protection',
  'dust resistance': 'body.protection',
  'mil-std': 'body.protection',

  // Software
  'operating system': 'software.os',
  'os': 'software.os',
  'os ui': 'software.os',
  'software updates': 'software.updatePolicy',
  'update policy': 'software.updatePolicy',

  // Misc
  'nfc': 'misc.nfc',
  'color': 'body.colors',
  'colors': 'body.colors',
  'color options': 'body.colors',

  // Price
  'price': 'misc.price',
};

/**
 * Map raw scraped specs (label → value) to dot-notation param keys.
 * Filters out fields the user marked as "不要".
 */
export function mapRawToParams(raw: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [label, value] of Object.entries(raw)) {
    const normalizedLabel = label.toLowerCase().trim();

    // Skip explicitly excluded fields
    if (SKIP_FIELDS.has(normalizedLabel)) continue;
    if ([...SKIP_FIELDS].some(sf => normalizedLabel.includes(sf))) continue;

    // Try exact match first
    let key = LABEL_TO_KEY[normalizedLabel];

    // Try partial match — but only if the map label is specific enough (>= 3 chars)
    // and the match isn't cross-category (e.g. "battery type" should NOT match "display type")
    if (!key) {
      for (const [mapLabel, mapKey] of Object.entries(LABEL_TO_KEY)) {
        if (mapLabel.length < 3) continue; // skip too-short keys like "os", "cpu"
        if (normalizedLabel.includes(mapLabel)) {
          key = mapKey;
          break;
        }
      }
    }

    if (key && value.trim()) {
      // Special handling: NFC
      if (key === 'misc.nfc') {
        const lower = value.toLowerCase().trim();
        result[key] = (lower === 'no' || lower === 'n/a' || lower === '-') ? '不支持' : value;
      } else if (key === 'body.protection' && result[key]) {
        // Protection: append multiple values (IP + MIL-STD)
        result[key] = result[key] + ', ' + value.trim();
      } else {
        // Don't overwrite if already set (first match wins)
        if (!result[key]) {
          result[key] = value.trim();
        }
      }
    }
  }

  // ── Post-processing: split compound values ──

  // Processor: "Mediatek Dimensity 7300 (4 nm)" → keep full string in platform.chipset (fabrication is now part of the value)
  // No longer split out fabrication — it stays in platform.chipset like "Dimensity 7300 (4 nm)"

  // Battery: "Li-Ion 6500 mAh, non-removable" → "6500mAh" + extract charging
  if (result['battery.type']) {
    const batVal = result['battery.type'];
    // Extract charging wattage before cleaning
    if (!result['battery.charging']) {
      const wattMatch = batVal.match(/(\d+)\s*[wW]/);
      if (wattMatch) {
        result['battery.charging'] = wattMatch[1] + 'W';
      }
    }
    // Simplify to just "6500mAh" format
    const mahMatch = batVal.match(/(\d[\d,]*)\s*mAh/i);
    if (mahMatch) {
      result['battery.type'] = mahMatch[1].replace(/,/g, '') + 'mAh';
    }
  }

  // Display: extract sub-fields from compound values
  // GSMArena puts everything in display.type: "IPS LCD, 120Hz, 1050 nits (HBM)"
  // refreshRate and brightness are now part of display.type value — no separate fields

  // Clean display.type: keep full value as-is (includes Hz, nits info)
  // No longer strip Hz/nits — they're part of the type field now

  // Weight: keep gram portion but preserve variants
  // "204 g or 208 g (7.20 oz)" → "204g or 208g" (strip oz, keep all g variants)
  if (result['body.weight']) {
    let w = result['body.weight'];
    // Remove oz portion
    w = w.replace(/\s*\([\d.]+\s*oz\)\s*/gi, '').trim();
    // Compact spaces around "g"
    w = w.replace(/(\d+)\s*g/gi, '$1g');
    result['body.weight'] = w;
  }

  // Price: clean up currency symbols and entities → just the number
  if (result['misc.price']) {
    const priceVal = result['misc.price']
      .replace(/[₹$€£¥]/g, '')
      .replace(/&[^;]+;/g, '')
      .replace(/,/g, '')
      .trim();
    const priceNum = priceVal.match(/(\d[\d,]*)/);
    if (priceNum) {
      result['misc.price'] = priceNum[1].replace(/,/g, '');
    }
  }

  // Protection: keep full description
  // "IP64 dust tight and water resistant (water splashes)" → keep as-is

  // Camera: strip "Dual", "Triple", "Quad", "Single" prefixes
  // "Dual 50 MP, f/1.8, PDAF" → "50 MP, f/1.8, PDAF"
  for (const camKey of ['camera.specs', 'selfie.specs']) {
    if (result[camKey]) {
      result[camKey] = result[camKey]
        .replace(/^(Dual|Triple|Quad|Single|Penta)\s*/i, '')
        .trim();
    }
  }

  // Normalize separator for all values
  for (const key of Object.keys(result)) {
    if (!result[key]) continue;
    result[key] = normalizeParamSeparator(result[key]);
  }

  return result;
}

/**
 * Normalize separators in a param value: comma → " / ".
 * Preserves numeric commas like "1,080".
 * Exported so all param entry points can use it.
 */
export function normalizeParamSeparator(value: string): string {
  return value.replace(/,\s*/g, (match, offset, str) => {
    const before = str[offset - 1];
    const afterChar = str[offset + match.length];
    // Keep numeric commas like "1,080" or "16,999"
    if (before && /\d/.test(before) && afterChar && /\d/.test(afterChar)) {
      return match;
    }
    return ' / ';
  });
}

/**
 * Normalize all param values in a record.
 */
export function normalizeAllParams(params: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    result[key] = value ? normalizeParamSeparator(value) : value;
  }
  return result;
}

/**
 * Strip HTML tags and decode entities, keeping only text content.
 */
function stripHtml(html: string): string {
  return html
    // Remove script/style blocks entirely
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&thinsp;/g, '')
    .replace(/&#8377;/g, '₹')
    .replace(/&#\d+;/g, '') // strip remaining numeric entities
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse specs from HTML table structures.
 * Looks for <tr><td>Label</td><td>Value</td></tr> patterns.
 */
function parseHtmlTables(html: string): Record<string, string> {
  const raw: Record<string, string> = {};

  // Pattern 1: <td> or <th> based tables — "Label</td><td>Value"
  const tdPattern = /<t[hd][^>]*>\s*(.*?)\s*<\/t[hd]>\s*<t[hd][^>]*>\s*(.*?)\s*<\/t[hd]>/gi;
  let match;
  while ((match = tdPattern.exec(html)) !== null) {
    const label = stripHtml(match[1]).trim();
    const value = stripHtml(match[2]).trim();
    if (label && value && label.length < 100 && value.length < 300 && !label.includes('{') && !value.includes('{')) {
      raw[label] = value;
    }
  }

  // Pattern 2: <dt><dd> definition lists
  const dlPattern = /<dt[^>]*>\s*(.*?)\s*<\/dt>\s*<dd[^>]*>\s*(.*?)\s*<\/dd>/gi;
  while ((match = dlPattern.exec(html)) !== null) {
    const label = stripHtml(match[1]).trim();
    const value = stripHtml(match[2]).trim();
    if (label && value && label.length < 100 && value.length < 300) {
      raw[label] = value;
    }
  }

  return raw;
}

/**
 * Parse specs from plain text (after HTML stripping).
 * Looks for "Label: Value" patterns on separate lines.
 */
function parseTextKeyValue(text: string): Record<string, string> {
  const raw: Record<string, string> = {};
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 60) {
      const label = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      // Filter out junk: URLs, JS code, CSS, etc.
      if (
        label && value &&
        value.length < 300 &&
        !value.includes('http') &&
        !value.includes('function') &&
        !value.includes('{') &&
        !label.includes('<') &&
        !label.includes('google') &&
        !label.includes('script')
      ) {
        raw[label] = value;
      }
    }
  }

  return raw;
}

/**
 * Parse specs from GSMArena HTML content.
 * GSMArena uses <td class="ttl"> for labels and <td class="nfo"> for values.
 */
export function parseGSMArenaHtml(html: string): Record<string, string> {
  const raw: Record<string, string> = {};

  // GSMArena structure: <th> section headers, then <td class="ttl"> + <td class="nfo"> pairs
  // Extract section headers to track context (Main Camera, Selfie camera, etc.)
  const sectionPattern = /<th[^>]*>\s*(.*?)\s*<\/th>/gi;
  const specPattern = /<td\s+class="ttl"[^>]*>\s*(?:<a[^>]*>)?\s*(.*?)\s*(?:<\/a>)?\s*<\/td>\s*<td\s+class="nfo"[^>]*>\s*(.*?)\s*<\/td>/gi;

  // Build ordered list of all elements with their positions
  const elements: { type: 'section' | 'spec'; pos: number; label: string; value?: string }[] = [];

  let match;
  while ((match = sectionPattern.exec(html)) !== null) {
    elements.push({ type: 'section', pos: match.index, label: stripHtml(match[1]).trim() });
  }
  while ((match = specPattern.exec(html)) !== null) {
    const label = stripHtml(match[1]).trim();
    const value = stripHtml(match[2]).trim();
    if (label && value && label.length < 80 && value.length < 300) {
      elements.push({ type: 'spec', pos: match.index, label, value });
    }
  }

  // Sort by position and process with section context
  elements.sort((a, b) => a.pos - b.pos);
  let currentSection = '';

  for (const el of elements) {
    if (el.type === 'section') {
      currentSection = el.label.toLowerCase();
      continue;
    }
    const label = el.label;
    const value = el.value!;

    // Prefix ambiguous labels with section context
    if (label.toLowerCase() === 'video') {
      if (currentSection.includes('selfie') || currentSection.includes('front')) {
        raw['selfie video'] = value;
      } else {
        raw['rear video'] = value;
      }
    } else if (['dual', 'triple', 'quad', 'single', 'penta'].includes(label.toLowerCase())) {
      if (currentSection.includes('selfie') || currentSection.includes('front')) {
        raw['selfie camera'] = value;
      } else {
        raw['main camera'] = value;
      }
    } else {
      // Use section prefix for disambiguation if label is generic
      const key = (currentSection && label.length < 15) ? `${currentSection} ${label}` : label;
      if (!raw[key]) raw[key] = value;
      // Also store without prefix for fallback matching
      if (!raw[label]) raw[label] = value;
    }
  }

  // If GSMArena-specific pattern didn't work, try generic table parsing
  if (Object.keys(raw).length < 3) {
    const tableSpecs = parseHtmlTables(html);
    Object.assign(raw, tableSpecs);
  }

  return raw;
}

/**
 * Parse specs from TechSpecs.info HTML content.
 * Returns raw label→value map.
 */
export function parseTechSpecsHtml(html: string): Record<string, string> {
  // Try table-based extraction first (most reliable)
  const tableSpecs = parseHtmlTables(html);
  if (Object.keys(tableSpecs).length >= 3) return tableSpecs;

  // Fall back to text extraction
  const text = stripHtml(html);
  return parseTextKeyValue(text);
}

/**
 * Parse specs from 91mobiles.com HTML content.
 */
export function parse91mobilesHtml(html: string): Record<string, string> {
  // 91mobiles uses structured spec tables
  const tableSpecs = parseHtmlTables(html);
  if (Object.keys(tableSpecs).length >= 3) return tableSpecs;

  const text = stripHtml(html);
  return parseTextKeyValue(text);
}

/**
 * Parse specs from CellKaro.com HTML content.
 * Returns raw label→value map.
 */
export function parseCellKaroHtml(html: string): Record<string, string> {
  const tableSpecs = parseHtmlTables(html);
  if (Object.keys(tableSpecs).length >= 3) return tableSpecs;

  const text = stripHtml(html);
  const raw: Record<string, string> = {};
  const linePattern = /^[-*]?\s*(.+?):\s*(.+)$/gm;
  let match;
  while ((match = linePattern.exec(text)) !== null) {
    const label = match[1].trim();
    const value = match[2].trim();
    if (label && value && value.length < 500 && !value.includes('http') && !label.includes('{')) {
      raw[label] = value;
    }
  }

  return raw;
}

/** Total number of param fields we track */
export const TOTAL_PARAM_FIELDS = Object.keys(
  [...new Set(Object.values(LABEL_TO_KEY))].reduce((acc, k) => ({ ...acc, [k]: true }), {})
).length;
