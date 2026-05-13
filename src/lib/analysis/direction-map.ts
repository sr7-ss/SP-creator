/**
 * Direction map for parameter comparison.
 * Each param key has sub-value extraction patterns with comparison direction.
 * 'higher' = bigger number is better; 'lower' = smaller is better.
 *
 * Supports both new dot-notation keys and legacy flat keys.
 */

export interface SubValueRule {
  label: string;
  pattern: RegExp;
  direction: 'higher' | 'lower';
  /** If true, any difference counts as a lead (for model numbers where 7400 > 7300 is significant) */
  ordinal?: boolean;
}

export const DIRECTION_MAP: Record<string, SubValueRule[]> = {
  // === New dot-notation keys ===

  // Display
  'display.size': [
    { label: 'size', pattern: /(\d+\.?\d*)\s*(?:英寸|inch|inches|")/i, direction: 'higher' },
  ],
  'display.type': [
    { label: 'refresh', pattern: /(\d+)\s*Hz/i, direction: 'higher' },
    { label: 'brightness', pattern: /(\d+)\s*nits/i, direction: 'higher' },
  ],
  'display.resolution': [
    { label: 'ppi', pattern: /(\d+)/i, direction: 'higher' },
  ],
  'display.protection': [],  // qualitative

  // Platform
  'platform.chipset': [
    { label: 'antutu', pattern: /(?:Antutu|安兔兔)\s*(\d+)/i, direction: 'higher' },
    { label: 'antutu_wan', pattern: /(\d+)\s*(?:万分|万)/i, direction: 'higher' },
    // Model number: Dimensity 7300, MTK 7400, Snapdragon 8, Helio G99, etc.
    // ordinal: any higher number = significant lead (not percentage-based)
    { label: 'model', pattern: /(?:Dimensity|天玑|MTK|Snapdragon|骁龙|Helio|Kirin|麒麟|Exynos|Unisoc)\s*(\d{3,})/i, direction: 'higher', ordinal: true },
    { label: 'power', pattern: /(\d+)\s*[wW]/, direction: 'lower' },
  ],
  'platform.cpu': [],  // qualitative

  // Memory
  'memory.type': [],  // qualitative: UFS 3.1 vs UFS 2.2
  'memory.internal': [
    { label: 'ram', pattern: /(\d+)\s*(?:\+|GB\s*RAM|GB\s*\+)/i, direction: 'higher' },
    { label: 'rom', pattern: /\+\s*(\d+)/i, direction: 'higher' },
  ],

  // Camera
  'camera.specs': [
    { label: 'main', pattern: /(\d+)\s*(?:M|MP|万)/i, direction: 'higher' },
  ],
  'camera.video': [],  // qualitative: 4K vs 1080p
  'selfie.specs': [
    { label: 'mp', pattern: /(\d+)\s*(?:M|MP|万)/i, direction: 'higher' },
  ],
  'selfie.video': [],  // qualitative
  'platform.gpu': [],  // qualitative

  // Battery
  'battery.type': [
    { label: 'capacity', pattern: /(\d+)\s*mAh/i, direction: 'higher' },
  ],
  'battery.charging': [
    { label: 'charging', pattern: /(\d+)\s*[wW]/, direction: 'higher' },
  ],

  // Body
  'body.dimensions': [
    { label: 'thickness', pattern: /(?:x\s*)?(\d+\.?\d*)\s*mm/i, direction: 'lower' },  // thinner = better
  ],
  'body.weight': [
    { label: 'weight', pattern: /(\d+)\s*g/i, direction: 'lower' },  // lighter = better
  ],
  'body.build': [],   // qualitative: glass/plastic/metal
  'body.protection': [
    { label: 'ip', pattern: /IP\s*(\d+)/i, direction: 'higher' },
  ],

  // Software
  'software.os': [],
  'software.updatePolicy': [],

  // Misc
  'body.colors': [],  // qualitative
  'misc.others': [],  // catch-all: VC cooling, speakers, fingerprint, etc.
  'misc.nfc': [],
  'misc.price': [
    { label: 'price', pattern: /(\d[\d,]*)/i, direction: 'lower' },
  ],

  // === Legacy flat keys (backward compatibility) ===
  display: [
    { label: 'size', pattern: /(\d+\.?\d*)\s*(?:英寸|inch|"|\b(?=FHD|HD|2K|QHD))/i, direction: 'higher' },
    { label: 'refresh', pattern: /(\d+)\s*Hz/i, direction: 'higher' },
    { label: 'brightness', pattern: /(\d+)\s*nits/i, direction: 'higher' },
  ],
  chipset: [
    { label: 'antutu', pattern: /(?:Antutu|安兔兔)\s*(\d+)/i, direction: 'higher' },
    { label: 'antutu_wan', pattern: /(\d+)\s*(?:万分|万)/i, direction: 'higher' },
    { label: 'model', pattern: /(?:Dimensity|天玑|MTK|Snapdragon|骁龙|Helio|Kirin|麒麟|Exynos|Unisoc)\s*(\d{3,})/i, direction: 'higher', ordinal: true },
    { label: 'power', pattern: /(\d+)\s*[wW]/, direction: 'lower' },
  ],
  rear_camera: [
    { label: 'main', pattern: /(\d+)\s*(?:M|MP|万)/i, direction: 'higher' },
  ],
  front_camera: [
    { label: 'mp', pattern: /(\d+)\s*(?:M|MP|万)/i, direction: 'higher' },
  ],
  battery: [
    { label: 'capacity', pattern: /(\d+)\s*mAh/i, direction: 'higher' },
    { label: 'charging', pattern: /(\d+)\s*[wW]/, direction: 'higher' },
  ],
  memory: [
    { label: 'ram', pattern: /(\d+)\s*(?:\+|GB\s*RAM|GB\s*\+)/i, direction: 'higher' },
    { label: 'rom', pattern: /\+\s*(\d+)/i, direction: 'higher' },
  ],
  fingerprint: [],
  durability: [
    { label: 'ip', pattern: /IP\s*(\d+)/i, direction: 'higher' },
  ],
  speakers: [],
  cooling: [
    { label: 'area', pattern: /(\d+)\s*mm/i, direction: 'higher' },
  ],
  price: [
    { label: 'price', pattern: /(\d[\d,]*)/i, direction: 'lower' },
  ],
  launch: [],
  others: [],
};

/** Fields that should be skipped in numeric comparison (qualitative only) */
export const SKIP_COMPARISON_KEYS = new Set([
  'display.protection',
  'platform.cpu', 'platform.gpu',
  'camera.video',
  'body.build', 'body.sim',
  'body.colors', 'misc.others', 'misc.nfc',
  'software.os', 'software.updatePolicy',
  'launch', 'others',
]);

/**
 * Parameter key → human-readable name mapping.
 */
export const PARAM_DISPLAY_NAMES: Record<string, { en: string; zh: string }> = {
  // New dot-notation
  'display.size': { en: 'Screen Size', zh: '屏幕尺寸' },
  'display.type': { en: 'Type', zh: '类型' },
  'display.resolution': { en: 'Resolution', zh: '分辨率' },
  'display.protection': { en: 'Protection', zh: '屏幕保护' },
  'platform.chipset': { en: 'Chipset', zh: '芯片' },
  'platform.cpu': { en: 'CPU', zh: 'CPU' },
  'memory.internal': { en: 'Internal Memory', zh: '内存+存储' },
  'memory.type': { en: 'Storage Type', zh: '存储类型' },
  'camera.specs': { en: 'Rear Camera', zh: '后置主摄' },
  'camera.video': { en: 'Video', zh: '视频' },
  'selfie.specs': { en: 'Front Camera', zh: '前置摄像头' },
  'selfie.video': { en: 'Selfie Video', zh: '前摄视频' },
  'platform.gpu': { en: 'GPU', zh: 'GPU' },
  'battery.type': { en: 'Battery', zh: '电池' },
  'battery.charging': { en: 'Charging', zh: '充电' },
  'body.dimensions': { en: 'Dimensions', zh: '尺寸' },
  'body.weight': { en: 'Weight', zh: '重量' },
  'body.build': { en: 'Build', zh: '材质' },
  'body.protection': { en: 'Protection', zh: '防护' },
  'software.os': { en: 'OS', zh: '操作系统' },
  'software.updatePolicy': { en: 'Update Policy', zh: '更新策略' },
  'body.colors': { en: 'Colors', zh: '颜色' },
  'misc.others': { en: 'Others', zh: '其他' },
  'misc.nfc': { en: 'NFC', zh: 'NFC' },
  'misc.price': { en: 'Price', zh: '价格' },
  // Legacy flat keys
  display: { en: 'Display', zh: '屏幕' },
  chipset: { en: 'Chipset', zh: '芯片' },
  rear_camera: { en: 'Rear Camera', zh: '后摄' },
  front_camera: { en: 'Front Camera', zh: '前摄' },
  battery: { en: 'Battery', zh: '电池' },
  memory: { en: 'Memory', zh: '内存' },
  fingerprint: { en: 'Fingerprint', zh: '指纹' },
  durability: { en: 'Durability', zh: '防护' },
  speakers: { en: 'Speakers', zh: '扬声器' },
  cooling: { en: 'Cooling', zh: '散热' },
  price: { en: 'Price', zh: '价格' },
  launch: { en: 'Launch', zh: '上市时间' },
  others: { en: 'Others', zh: '其他' },
};
