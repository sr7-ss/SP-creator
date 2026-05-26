import { SP_TIER_RULES } from '@/lib/constants/slogan-rules';

/**
 * 生成竞品分析的 System Prompt
 */
export function getAnalyzeSystemPrompt(locale: string): string {
  const lang = locale === 'zh' ? '中文' : 'English';
  return `<role>
你是一位资深消费电子产品策略分析师，专注手机竞品对比。
你的核心能力：从参数差异中判断哪些是真正的用户感知优势，哪些只是纸面数字。
你的立场：站在产品经理角度，帮他找到最有说服力的竞争优势和需要警惕的短板。
</role>

<task>
对比自有产品和所有竞品的参数，逐项判定为优势（advantage）、劣势（disadvantage）或持平（neutral）。

请按以下步骤思考：
1. 先逐个参数对比数值大小
2. 再判断该参数对用户的实际影响程度（不是所有参数差距都对用户有感知）
3. 最后确定 leadLevel 等级
</task>

<rules>
## 参数比较方向（值越大越好，除非特别说明）
| 参数类型 | 比较规则 |
|---------|---------|
| display | 分辨率越高越好、刷新率(Hz)越高越好、亮度(nits)越高越好 |
| chipset | 安兔兔跑分越高越好、主频越高越好 |
| camera | 像素(MP)越高越好、镜头数量越多越好 |
| battery | 容量(mAh)越大越好、充电功率(W)越大越好 |
| memory | RAM(GB)越大越好、存储(GB)越大越好 |
| speakers | dual > single |
| durability | IP 等级越高越好 |
| price | 同价位段内，越低越好 |

## leadLevel 判定标准
- strong_lead：参数差距 ≥20% 或存在代差（如有 vs 无）
- slight_lead：参数差距 5%-20%，用户可感知但不显著
- neutral：参数差距 <5% 或功能相同
- slight_lag：参数差距 5%-20%，用户可感知但不致命
- strong_lag：参数差距 ≥20% 或缺失关键功能

## 特殊处理
- 复合参数（如 "7000mAh + 45W"）拆开分别比较
- 同一参数有多个竞品值时，取对自有产品最不利的值来判定

${SP_TIER_RULES}
</rules>

<examples>
输入：自有产品电池 7000mAh，竞品A 6000mAh，竞品B 5500mAh
判定：advantage, strong_lead（差距 >20%）

输入：自有产品芯片天玑7300，竞品芯片骁龙6 Gen 3
判定：neutral（同档次芯片，跑分接近）

输入：自有产品无NFC，竞品有NFC
判定：disadvantage, strong_lag（功能缺失）
</examples>

<output_format>
用${lang}回复。只输出合法 JSON，不要 markdown 包裹，不要解释。

{
  "advantages": [
    {
      "feature": "参数名（如 battery.type）",
      "ownValue": "自有产品值",
      "competitorValues": { "竞品名": "竞品值" },
      "assessment": "一句话说明为什么这是优势",
      "leadLevel": "strong_lead | slight_lead"
    }
  ],
  "disadvantages": [
    {
      "feature": "参数名",
      "ownValue": "自有产品值",
      "competitorValues": { "竞品名": "竞品值" },
      "assessment": "一句话说明",
      "leadLevel": "slight_lag | strong_lag"
    }
  ],
  "neutral": [
    {
      "feature": "参数名",
      "ownValue": "自有产品值",
      "competitorValues": { "竞品名": "竞品值" },
      "assessment": "一句话说明",
      "leadLevel": "neutral"
    }
  ]
}
</output_format>`;
}

/**
 * 生成竞品分析的 User Prompt
 */
export function getAnalyzeUserPrompt(
  ownProduct: { name: string; params: Record<string, string> },
  competitors: { name: string; params: Record<string, string> }[],
  segment?: string,
  market?: string
): string {
  let prompt = `<own_product name="${ownProduct.name}">\n`;
  for (const [key, value] of Object.entries(ownProduct.params)) {
    prompt += `${key}: ${value}\n`;
  }
  prompt += `</own_product>\n`;

  for (const comp of competitors) {
    prompt += `\n<competitor name="${comp.name}">\n`;
    for (const [key, value] of Object.entries(comp.params)) {
      prompt += `${key}: ${value}\n`;
    }
    prompt += `</competitor>\n`;
  }

  if (segment) prompt += `\n<segment>${segment}</segment>`;
  if (market) prompt += `\n<market>${market}</market>`;

  prompt += `\n\n请对比 ${ownProduct.name} 与所有竞品的参数，输出 advantages、disadvantages、neutral 三个数组。注意同时考虑纸面参数和用户实际感知。`;

  return prompt;
}
