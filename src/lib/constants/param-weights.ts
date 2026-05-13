import { ParamWeight } from '@/types';

// === Type Definitions ===

export interface ParamField {
  key: string;    // dot-notation: "display.type"
  nameEn: string;
  nameZh: string;
}

export interface ParamCategory {
  key: string;    // category key: "display"
  nameEn: string;
  nameZh: string;
  fields: ParamField[];
}

// === Hierarchical Parameter Categories ===

export const PARAM_CATEGORIES: ParamCategory[] = [
  {
    key: 'display', nameEn: 'Display', nameZh: '显示',
    fields: [
      { key: 'display.type', nameEn: 'Type', nameZh: '类型' },
      { key: 'display.size', nameEn: 'Size', nameZh: '尺寸' },
      { key: 'display.resolution', nameEn: 'Resolution', nameZh: '分辨率' },
      { key: 'display.protection', nameEn: 'Protection', nameZh: '屏幕保护' },
    ],
  },
  {
    key: 'platform', nameEn: 'Platform', nameZh: '平台',
    fields: [
      { key: 'platform.chipset', nameEn: 'Chipset', nameZh: '芯片' },  // "Mediatek Dimensity 7300 (4 nm)"
      { key: 'platform.cpu', nameEn: 'CPU', nameZh: 'CPU' },
      { key: 'platform.gpu', nameEn: 'GPU', nameZh: 'GPU' },
    ],
  },
  {
    key: 'memory', nameEn: 'Memory', nameZh: '存储',
    fields: [
      { key: 'memory.internal', nameEn: 'Internal', nameZh: '内置存储' },
      { key: 'memory.type', nameEn: 'Storage Type', nameZh: '存储类型' },  // "UFS 3.1"
    ],
  },
  {
    key: 'camera', nameEn: 'Main Camera', nameZh: '主摄',
    fields: [
      { key: 'camera.specs', nameEn: 'Specs', nameZh: '参数' },       // "50 MP, f/1.8, PDAF"
      { key: 'camera.video', nameEn: 'Video', nameZh: '视频' },       // "4K@30fps, 1080p@30fps"
    ],
  },
  {
    key: 'selfie', nameEn: 'Selfie Camera', nameZh: '前摄',
    fields: [
      { key: 'selfie.specs', nameEn: 'Specs', nameZh: '参数' },
      { key: 'selfie.video', nameEn: 'Video', nameZh: '视频' },
    ],
  },
  {
    key: 'battery', nameEn: 'Battery', nameZh: '电池',
    fields: [
      { key: 'battery.type', nameEn: 'Type', nameZh: '类型' },        // "Li-Ion 6500 mAh"
      { key: 'battery.charging', nameEn: 'Charging', nameZh: '充电' }, // "44W wired, 50% in 40 min"
    ],
  },
  {
    key: 'body', nameEn: 'Body', nameZh: '机身',
    fields: [
      { key: 'body.dimensions', nameEn: 'Dimensions', nameZh: '尺寸' },
      { key: 'body.weight', nameEn: 'Weight', nameZh: '重量' },
      { key: 'body.build', nameEn: 'Build', nameZh: '材质' },
      { key: 'body.sim', nameEn: 'SIM', nameZh: 'SIM' },
      { key: 'body.protection', nameEn: 'Protection', nameZh: '防护' },
      { key: 'body.colors', nameEn: 'Colors', nameZh: '颜色' },
    ],
  },
  {
    key: 'software', nameEn: 'Software', nameZh: '软件',
    fields: [
      { key: 'software.os', nameEn: 'OS', nameZh: '操作系统' },
    ],
  },
  {
    key: 'misc', nameEn: 'Misc', nameZh: '其他',
    fields: [
      { key: 'misc.others', nameEn: 'Others', nameZh: '其他' },
      { key: 'misc.nfc', nameEn: 'NFC', nameZh: 'NFC' },
      { key: 'misc.price', nameEn: 'Price', nameZh: '价格' },
    ],
  },
];

// === Flattened rows (backward compatible) ===

export function flattenParamRows(): ParamField[] {
  return PARAM_CATEGORIES.flatMap(cat => cat.fields);
}

/** Backward-compatible flat list for components that still expect it */
export const DEFAULT_PARAM_ROWS = flattenParamRows();

/** Get category key from a dot-notation field key */
export function getCategoryKey(fieldKey: string): string {
  const dotIdx = fieldKey.indexOf('.');
  return dotIdx > 0 ? fieldKey.substring(0, dotIdx) : fieldKey;
}

/** Find category by field key */
export function getCategoryForField(fieldKey: string): ParamCategory | undefined {
  const catKey = getCategoryKey(fieldKey);
  return PARAM_CATEGORIES.find(c => c.key === catKey);
}

// === Parameter Weights (category-level) ===

export const DEFAULT_PARAM_WEIGHTS: ParamWeight[] = [
  // Tier 1 - 高权重
  { name: 'Platform', nameZh: '平台', tier: 1 },
  { name: 'Battery', nameZh: '电池', tier: 1 },
  { name: 'Main Camera', nameZh: '主摄', tier: 1 },

  // Tier 2 - 中权重
  { name: 'Display', nameZh: '显示', tier: 2 },
  { name: 'Memory', nameZh: '存储', tier: 2 },
  { name: 'Body', nameZh: '机身', tier: 2 },
  { name: 'Selfie Camera', nameZh: '前摄', tier: 2 },

  // Tier 3 - 低权重
  { name: 'Software', nameZh: '软件', tier: 3 },
  { name: 'Misc', nameZh: '其他', tier: 3 },
];

/** Map category key → weight tier for rule engine scoring */
export const CATEGORY_WEIGHT_MAP: Record<string, 1 | 2 | 3> = {
  platform: 1,
  battery: 1,
  camera: 1,
  display: 2,
  memory: 2,
  body: 2,
  selfie: 2,
  software: 3,
  misc: 3,
};
