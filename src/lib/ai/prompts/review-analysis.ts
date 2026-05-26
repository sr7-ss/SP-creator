/**
 * Prompts for batch review sentiment analysis and SP dimension mapping.
 */

const DIMENSIONS = [
  'battery', 'display', 'camera', 'performance', 'design',
  'price', 'software', 'durability', 'audio', 'connectivity', 'other',
] as const;

export type ReviewDimension = typeof DIMENSIONS[number];

export const DIMENSION_LABELS: Record<ReviewDimension, { en: string; zh: string }> = {
  battery: { en: 'Battery', zh: '续航/电池' },
  display: { en: 'Display', zh: '屏幕/显示' },
  camera: { en: 'Camera', zh: '相机/拍照' },
  performance: { en: 'Performance', zh: '性能/速度' },
  design: { en: 'Design', zh: '外观/设计' },
  price: { en: 'Price/Value', zh: '价格/性价比' },
  software: { en: 'Software/OS', zh: '系统/软件' },
  durability: { en: 'Durability', zh: '耐用性' },
  audio: { en: 'Audio', zh: '音频/扬声器' },
  connectivity: { en: 'Connectivity', zh: '连接性/信号' },
  other: { en: 'Other', zh: '其他' },
};

export function getReviewAnalysisSystemPrompt(locale: string): string {
  const lang = locale === 'zh' ? '中文' : 'English';

  return `<role>
你是一位消费电子产品评论分析专家。
你的核心能力：从用户评论中准确判断情感倾向，并识别评论讨论的产品维度。
你的判断标准：情感判断以用户的实际满意度为准，不是词面的褒贬。"电池还行吧"= neutral，不是 positive。
</role>

<task>
对每条用户评论进行分析，提取以下 4 个字段：
1. sentiment：positive / negative / neutral
2. score：-1.0（极度不满）到 1.0（极度满意），0 = 中性
3. dimensions：评论涉及的产品维度，只能从以下列表选择：${DIMENSIONS.join(', ')}
4. highlights：1-3 个关键短语，摘录评论中最能体现情感的原文片段
</task>

<rules>
## sentiment 判定标准
| 情况 | 判定 | score 范围 |
|------|------|-----------|
| 明确表达满意、推荐、惊喜 | positive | 0.3 ~ 1.0 |
| 明确表达不满、失望、抱怨 | negative | -1.0 ~ -0.3 |
| 语气模糊、"还行"、"一般"、无明显倾向 | neutral | -0.3 ~ 0.3 |

## dimensions 判定
- 一条评论可以涉及多个维度（如"电池好但拍照差" → ["battery", "camera"]）
- 如果评论太模糊无法判定维度，返回空数组 []
- 不要臆造维度，只用上面的 11 个选项

## 硬性约束
- 输出的 JSON 数组长度必须与输入评论数量完全一致
- 每个条目必须包含：text、sentiment、score、dimensions、highlights
</rules>

<examples>
输入："电池续航非常好，用了两天才充电，但是拍照夜景模式有点糊"
输出：{"text": "电池续航非常好...", "sentiment": "positive", "score": 0.5, "dimensions": ["battery", "camera"], "highlights": ["两天才充电", "夜景模式有点糊"]}

输入："手机还行吧，没什么特别的"
输出：{"text": "手机还行吧...", "sentiment": "neutral", "score": 0.1, "dimensions": [], "highlights": ["还行吧"]}
</examples>

<output_format>
用${lang}回复。只输出合法 JSON 数组，不要 markdown 包裹，不要解释文字。
[
  { "text": "原始评论文本", "sentiment": "positive|negative|neutral", "score": 0.7, "dimensions": ["battery"], "highlights": ["关键短语"] }
]
</output_format>`;
}

export function getReviewAnalysisUserPrompt(
  reviews: string[],
  productName?: string,
): string {
  let prompt = '';
  if (productName) {
    prompt += `<product>${productName}</product>\n\n`;
  }
  prompt += `<reviews>\n`;
  reviews.forEach((r, i) => {
    prompt += `[${i + 1}] ${r}\n`;
  });
  prompt += `</reviews>\n\n请分析以上 ${reviews.length} 条评论，输出恰好 ${reviews.length} 个条目的 JSON 数组。`;
  return prompt;
}
