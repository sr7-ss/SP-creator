// === Product & Parameter Types ===

export interface ProductParam {
  name: string;
  value: string;
  isHighlight?: boolean; // 是否红色高亮（领先项）
}

export interface Product {
  id: string;
  name: string;
  isOwnProduct: boolean;
  params: Record<string, string>; // key: 参数名, value: 参数值
}

export interface Project {
  id: string;
  name: string;
  segment?: string; // 价位段
  market?: string; // 目标市场
  createdAt: string;
  products: Product[];
}

// === SP Types ===

export type SpTier = 0 | 1 | 2 | 3;

export interface SloganAlternative {
  text: string;
  type: string; // SloganType
}

export interface SpItem {
  id: string;
  tier: SpTier;
  featureName: string; // 参数名
  paramValue: string; // 参数值
  reasoning?: string; // AI 分级理由
  leadLevel?: 'strong_lead' | 'slight_lead' | 'neutral' | 'slight_lag' | 'strong_lag'; // 竞品领先等级
  l1Name?: string; // 卖点名
  l2Slogan?: string; // Slogan
  l2SloganType?: SloganType;
  l2Alternatives?: SloganAlternative[]; // 备选 Slogan（2-3条）
  l3Details?: L3SubPoint[];
  /** Model's chain-of-thought reasoning for this packaging decision, displayed in UI as "AI 推理" */
  packagingThinking?: string;
  sortOrder: number;
  packagingVersions?: PackagingVersion[]; // 版本历史
}

/** 单个卖点的包装版本快照 */
export interface PackagingVersion {
  version: number;
  l1Name: string;
  l2Slogan: string;
  l2SloganType: SloganType;
  l2Alternatives?: SloganAlternative[];
  l3Details?: L3SubPoint[];
  refinementPrompt?: string; // 用户的微调指令
  createdAt: string;
}

export type SloganType = 'factual' | 'functional' | 'emotional';

export interface L3SubPoint {
  name: string; // 子卖点名
  description: string; // 包装话术
  technique: PackagingTechnique; // 包装手法
}

export type PackagingTechnique = 'concrete' | 'equivalent' | 'extreme';
// concrete: 具象化 (玩X小时游戏)
// equivalent: 等价换算 (1台=2台iPhone)
// extreme: 极限表达 (1%电量通话30分钟)

// === AI Types ===

export type AIProvider = 'claude' | 'openai' | 'gemini' | 'minimax' | 'zhipu';

export type TaskCategory = 'light' | 'analysis' | 'creative' | 'research';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
}

export const AI_PROVIDER_META: Record<AIProvider, {
  label: string;
  defaultModel: string;
  models: string[];
}> = {
  claude: {
    label: 'Claude (Anthropic)',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-5-20251001'],
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  },
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
  },
  minimax: {
    label: 'Minimax',
    defaultModel: 'MiniMax-Text-01',
    models: ['MiniMax-Text-01', 'abab6.5s-chat'],
  },
  zhipu: {
    label: '智谱 AI',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-air', 'glm-4', 'glm-4-plus', 'glm-4v-plus'],
  },
};

export interface CompetitiveAnalysis {
  advantages: AnalysisItem[];
  disadvantages: AnalysisItem[];
  neutral: AnalysisItem[];
}

export interface AnalysisItem {
  feature: string;
  ownValue: string;
  competitorValues: Record<string, string>;
  assessment: string;
  leadLevel: 'strong_lead' | 'slight_lead' | 'neutral' | 'slight_lag' | 'strong_lag';
}

// === Parameter Weight Types ===

export type WeightTier = 1 | 2 | 3;

export interface ParamWeight {
  name: string;
  nameZh: string;
  tier: WeightTier;
}

// === Knowledge Base Types ===

export interface KnowledgeEntry {
  id: string;
  category: string;
  brand?: string;
  content: string;
  structured?: {
    param: string;
    sellingPoint: string;
    packagingCopy: string;
  }[];
  createdAt: string;
}

// === Packaging Output ===

export interface NormalizedPackaging {
  featureName: string;
  tier: number;
  l1Name: string;
  l2Slogan: string;
  l2SloganType: string;
  l2Alternatives?: SloganAlternative[];
  l3Details: L3SubPoint[];
  /** Model's chain-of-thought reasoning (extracted from `_thinking` field in JSON) */
  packagingThinking?: string;
}

// === Review Analysis ===

export type ReviewSentiment = 'positive' | 'negative' | 'neutral';

export interface ReviewItemResult {
  text: string;
  sentiment: ReviewSentiment;
  score: number;
  dimensions: string[];
  highlights: string[];
}

export interface ReviewBatchSummary {
  positive: number;
  negative: number;
  neutral: number;
  dimensions: Record<string, number>;
}

// === Agent Types ===

export type AgentType = 'discovery' | 'reviews' | 'creative' | 'research';

/** Deep Research 产出的结构化报告 */
export interface ResearchReport {
  summary: string;
  /** 用户最多提及的优点，按提及率排序 */
  topPros: ResearchMention[];
  /** 用户最多提及的缺点，按提及率排序 */
  topCons: ResearchMention[];
  /** 竞品卖点话术对比 */
  competitorMessaging: CompetitorMessagingItem[];
  /** 对 SP 分级和包装的建议 */
  spRecommendations: string[];
  /** 原始数据来源 */
  sources: { url: string; type: string; snippetCount: number }[];
}

/** 用户提及的优点/缺点条目 */
export interface ResearchMention {
  rank: number;           // 排名 1-N
  topic: string;          // 如 "电池续航"、"屏幕亮度"
  mentionRate: string;    // 如 "68%"
  finding: string;        // 一句话总结
  quotes: string[];       // 典型用户评论原文（2-3 条）
}

// Legacy alias for backward compatibility
export type ResearchInsight = ResearchMention;

export interface CompetitorMessagingItem {
  competitor: string;
  feature: string;
  messaging: string;
  source: string;
}

export interface AgentProgressStep {
  step: string;
  detail: string;
  progress: number;
  status: 'active' | 'done' | 'error';
}

// === Review Mining Agent Types ===

export interface ReviewInsight {
  theme: string;
  sentiment: ReviewSentiment;
  count: number;
  percentage: number;
  rootCause?: string;
  subThemes?: string[];
  severity?: 'high' | 'medium' | 'low';
  actionableInsight?: string;
}

export interface SpAdjustmentSuggestion {
  id: string;
  featureName: string;
  currentTier?: SpTier;
  suggestedTier: SpTier;
  reason: string;
  direction: 'promote' | 'demote' | 'add' | 'keep';
  confidence: number; // 0-1
}

export interface ReviewMiningResult {
  summary: ReviewBatchSummary;
  items: ReviewItemResult[];
  themes: ReviewInsight[];
  spSuggestions?: SpAdjustmentSuggestion[];
  specComparisons?: Record<string, unknown>;
}

// Discovery agent
export interface DiscoveredCompetitor {
  name: string;
  params: Record<string, string>;
  rationale: string;
  sources: string[];
}

// Creative exploration agent
export interface SloganVariant {
  text: string;
  type: 'factual' | 'functional' | 'emotional';
  score: number;
  reasoning: string;
  issues: string[];
}

// === i18n ===
export type Locale = 'en' | 'zh';
