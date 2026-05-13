/**
 * Default sub-feature suggestions for common selling point templates.
 * When user creates a template and types a matching feature name,
 * these defaults pre-populate the sub-features list.
 */

export interface SubFeatureDefault {
  name: string;
  nameEn: string;
}

export const TEMPLATE_DEFAULTS: Record<string, {
  matchFeatures: string[];
  parentNameHint: string;
  subFeatures: SubFeatureDefault[];
}> = {
  '电池+快充': {
    matchFeatures: ['电池', '快充', 'battery', 'charging', 'fast charge'],
    parentNameHint: 'Titan Battery + Fast Charge',
    subFeatures: [
      { name: '续航', nameEn: 'Battery Life' },
      { name: '长寿', nameEn: 'Longevity' },
      { name: '使用安全', nameEn: 'Safety' },
      { name: '轻薄', nameEn: 'Slim & Light' },
      { name: '快充速度', nameEn: 'Fast Charge Speed' },
      { name: '反向充电', nameEn: 'Reverse Charging' },
      { name: '旁路充电', nameEn: 'Bypass Charging' },
      { name: '一键降温', nameEn: 'Quick Cool' },
    ],
  },
};

/** Flat list of all default template keys for UI display */
export const TEMPLATE_DEFAULT_KEYS = Object.keys(TEMPLATE_DEFAULTS);
