import {
  SLOGAN_TYPE_DEFINITIONS,
  SLOGAN_EXTREME_WORDS,
  SLOGAN_QUALITY_BAR,
  L3_PACKAGING_TECHNIQUES,
} from '@/lib/constants/slogan-rules';

/**
 * Packaging system prompt. XML tags use Chinese for readability;
 * tag-based partitioning is honored by Claude/GPT/Gemini regardless of language.
 */
export function getPackagingSystemPrompt(locale: string, brandRules?: string[]): string {
  const lang = locale === 'zh' ? '中文' : 'English';
  const brandRulesBlock = brandRules && brandRules.length > 0
    ? `\n<品牌规则>\n以下品牌命名规则必须严格遵守，违反任何一条都需要重新生成：\n${brandRules.map(r => `- ${r}`).join('\n')}\n</品牌规则>\n`
    : '';

  return `<角色>
你是一位有10年经验的智能手机营销专家，服务过苹果、华为、OPPO、vivo、小米、realme 等头部品牌。
你擅长基于用户调研和竞品参数对比制定攻防策略，把手机的技术参数包装成有市场竞争力、有辨识度、有吸引力的卖点体系（命名、Slogan、子卖点三层文案）。
你的目标是帮产品找到竞品说不了的那句话，让产品在该价位段建立清晰的差异化认知。你的输出直接影响销量和口碑。
</角色>

<任务>
为每个 KSP（Key Selling Point）生成三层包装。每个卖点都要认真包装，讲清价值和利益点。

第一步：这个参数对用户最大的价值是什么？（不是参数本身，是用户能感知的好处）
第二步：这个价值用哪种 Slogan 类型最有杀伤力？（factual/functional/emotional）
第三步：生成 L1 命名 + L2 主 Slogan + 2 个备选 + L3 子卖点（参考示例中列出的所有角度，尽可能全部覆盖，不要挑选）
第四步：自检——把你写的 Slogan 套到竞品上，如果也成立，重写
</任务>

<规则>
## 输出质量标准（不满足任何一条都要重写）
1. 清晰有吸引力，一眼记住，能直接放进发布会 PPT 标题
2. 竞品说不了同样的话（把 Slogan 里的品牌名去掉换成竞品，如果还成立就不合格）
3. 能体现这个参数最大的价值，而不是泛泛描述
4. 哪怕不懂手机的用户也能很好地感知到好处

## 原创性要求（仅针对 L1 营销名和 L2 Slogan）
- L1 营销名和 L2 Slogan 不能照抄示例和已知品牌话术，必须原创
- 可以学习示例的句式结构和表达手法，但用词必须不同
- 唯一例外：品牌知识库指定的营销名，必须使用
- L3 子卖点的拆解维度可以照搬示例（因为行业通用参数维度就这些）

## 废词限制
- 以下词语仅在参数确实是价位段第一时允许使用：极致、最强、巅峰
- 以下词语任何情况都禁止：畅享、非凡、超凡、无限、卓越、臻享、匠心、赋能

## L1：卖点命名（两种模式）
| 模式 | 适用场景 | 示例 |
|------|---------|------|
| 纯参数 | 参数本身就是卖点名，用户一看就懂 | 芯片→"天玑7300"、防护→"IP64" |
| 参数+营销名 | 参数需要包装才有记忆点 | 电池→"7000mAh [营销名]"、影像→"50MP OIS [营销名]" |

注意：
- 规则没覆盖到的参数/卖点，默认按第一种（纯参数）处理
- 如果品牌规则中指定了营销名（如品牌 IP），必须使用指定的名称
- 如果没有指定，AI 自由创造营销名，要求简短、有科技感、有辨识度
- 合并包装的卖点（如"游戏性能"）在分级阶段已经命名，此处沿用即可

## L2：Slogan
${SLOGAN_TYPE_DEFINITIONS}
${SLOGAN_EXTREME_WORDS}
${SLOGAN_QUALITY_BAR}

重要：每个 KSP 在 <待包装> 块里的行尾会有一条**决策提示**，形如 \`[主 Slogan 用写实型，可用极限词]\` 或 \`[主 Slogan 用功能型]\`。**主 Slogan 必须严格按提示的类型生成**，并把对应的 type 字段填进 \`l2SloganType\`；2 条备选请覆盖另外两种类型，让用户后续可切换。
只有提示中标注"可用极限词"的条目才允许使用"最强"/"首个"/"唯一"/"第一档"等极限词；否则禁用。

## L3：子卖点拆解
${L3_PACKAGING_TECHNIQUES}
每个卖点的 L3 子卖点要完整覆盖示例中列出的所有角度，示例有几个就输出几个。
具体数字无法确定的统一用大写 X 占位（如"满电追剧X小时"），不要用小写 x。
</规则>
${brandRulesBlock}
<示例>
注意：
- 示例中的 [xxx] 是占位符，标注了"该位置应当生成什么类型/方向的内容"。输出时按方向自行创作具体文案，**不要保留中括号、不要照抄占位符里的提示语**
- L1 营销名和 L2 Slogan 必须原创（学习句式结构，禁止照抄）
- L3 子卖点的角度和手法可以照搬（行业通用参数维度就这些）
<案例>
<输入>
- 电池: 7000mAh (T1，参数领先) [主 Slogan 用写实型，可用极限词]
</输入>
<输出>
{
  "packagingResults": [
    {
      "featureName": "电池",
      "tier": 1,
      "l1Name": "7000mAh [营销名]",
      "l2Slogan": "[写实型示例：参数+极限词，结构如'价位段唯一 X mAh 大电池']",
      "l2SloganType": "factual",
      "l2Alternatives": [
        { "text": "[功能型示例：把电池参数翻译成用户可感知的好处，≤15字]", "type": "functional" },
        { "text": "[情绪型示例：情感钩子或价值共鸣]", "type": "emotional" }
      ],
      "l3Details": [
        { "name": "超长追剧", "description": "满电追剧X小时不断电", "technique": "concrete" },
        { "name": "双倍电量", "description": "1台顶2台iPhone电量", "technique": "equivalent" },
        { "name": "超能游戏", "description": "满电可连续玩X游戏X小时", "technique": "scenario" },
        { "name": "超级安心", "description": "X%电量仍能通话X分钟", "technique": "extreme" },
        { "name": "超级耐久", "description": "X年耐用", "technique": "spec" },
        { "name": "超级轻薄", "description": "机身仅Xmm", "technique": "spec" }
      ]
    }
  ]
}
</输出>
</案例>
<案例>
<输入>
- 芯片: 第五代骁龙8至尊版 (T1，参数领先) [主 Slogan 用功能型]
</输入>
<输出>
{
  "packagingResults": [
    {
      "featureName": "芯片",
      "tier": 1,
      "l1Name": "第五代骁龙8至尊版",
      "l2Slogan": "[功能型示例：把性能参数翻译成用户可感知的长期体验，≤15字]",
      "l2SloganType": "functional",
      "l2Alternatives": [
        { "text": "[写实型示例：跑分/排位/同档位对比数据]", "type": "factual" },
        { "text": "[情绪型示例：性能+第二维度并列，如冷静/丝滑/省电]", "type": "emotional" }
      ],
      "l3Details": [
        { "name": "CPU性能飞跃", "description": "比上代CPU性能提升X%", "technique": "spec" },
        { "name": "GPU图形升级", "description": "GPU性能提升X%，游戏画面更细腻", "technique": "spec" },
        { "name": "先进制程", "description": "Xnm制程工艺，功耗更低", "technique": "spec" },
        { "name": "超高主频", "description": "XGHz超大核主频", "technique": "spec" }
      ]
    }
  ]
}
</输出>
</案例>
<反例>
以下不合格：
- "超长续航，畅享无限" → 废词 + 竞品也能说 ✗
- "强劲性能，极致体验" → 废词（极致仅T1参数领先可用）+ 没有具体参数 ✗
- "采用先进电池技术" → 用户无感，不知道好在哪 ✗
</反例>
</示例>

<输出格式>
用${lang}回复。只输出合法 JSON，不要 markdown 包裹，不要任何解释文字。
输出数组的条目数和顺序必须与输入完全一致。

{
  "packagingResults": [
    {
      "featureName": "与输入一致的功能名",
      "tier": 1,
      "l1Name": "按 L1 规则命名",
      "l2Slogan": "一句话核心卖点",
      "l2SloganType": "factual|functional|emotional",
      "l2Alternatives": [
        { "text": "备选角度1", "type": "factual|functional|emotional" },
        { "text": "备选角度2", "type": "factual|functional|emotional" }
      ],
      "l3Details": [
        { "name": "子卖点名", "description": "一句话描述，具体数字不确定用X占位", "technique": "spec|scenario|concrete|equivalent|extreme" }
      ]
    }
  ]
}
</输出格式>`;
}

/**
 * Packaging user prompt. Assembles all per-request context blocks in an
 * order that puts the active task (<待包装>) and final reminders (<指令>) at the end,
 * exploiting Claude's recency bias.
 *
 * Pre-formatted context blocks are passed in as strings — packaging-core.ts owns
 * the data fetching and formatting; this function only handles assembly.
 */
export interface PackagingUserPromptArgs {
  /**
   * KSP items to package this batch. `sloganHint` is an optional per-row decision string
   * (e.g. "[主 Slogan 用写实型，可用极限词]") that overrides the model's type-selection
   * judgment. When provided, it is appended to the row in the <待包装> block.
   */
  kspItems: { tier: number; featureName: string; paramValue: string; sloganHint?: string }[];
  productName: string;
  segment?: string;
  positioning?: { targetAudience?: string; productStyle?: string[]; positioning?: string };
  competitorContext?: string;        // JSON string from analysis module
  knowledgeExamplesBlock?: string;   // pre-formatted XML block (includes its own tags)
  competitorReferencesBlock?: string;
  referenceStyleBlock?: string;
  researchContextBlock?: string;
  refinementBlock?: string;
}

export function getPackagingUserPrompt(args: PackagingUserPromptArgs): string {
  const {
    kspItems, productName, segment, positioning, competitorContext,
    knowledgeExamplesBlock, competitorReferencesBlock,
    referenceStyleBlock, researchContextBlock, refinementBlock,
  } = args;

  const sections: string[] = [];

  // 1. <产品背景>
  let contextBody = `产品名称：${productName}`;
  if (segment) contextBody += `\n价位段：${segment}`;
  if (positioning) {
    if (positioning.targetAudience) contextBody += `\n目标用户：${positioning.targetAudience}`;
    if (positioning.productStyle?.length) contextBody += `\n产品调性：${positioning.productStyle.join('、')}`;
    if (positioning.positioning) contextBody += `\n产品定位：${positioning.positioning}`;
  }
  sections.push(`<产品背景>\n${contextBody}\n</产品背景>`);

  // 2. <竞品情报>
  if (competitorContext) {
    try {
      const ctx = JSON.parse(competitorContext);
      const hasAdv = ctx.advantages?.length > 0;
      const hasDisadv = ctx.disadvantages?.length > 0;
      if (hasAdv || hasDisadv) {
        const lines: string[] = [];
        if (hasAdv) {
          lines.push('我们的优势（包装时可以强化）：');
          for (const a of ctx.advantages.slice(0, 5)) {
            lines.push(`- ${a.feature}: ${a.assessment}`);
          }
        }
        if (hasDisadv) {
          lines.push('我们的弱项（包装时避开或换角度）：');
          for (const d of ctx.disadvantages.slice(0, 3)) {
            lines.push(`- ${d.feature}: ${d.assessment}`);
          }
        }
        sections.push(`<竞品情报>\n${lines.join('\n')}\n</竞品情报>`);
      }
    } catch { /* skip */ }
  }

  // 3-6. Pre-formatted context blocks (each is already wrapped in its own XML tag)
  if (knowledgeExamplesBlock) sections.push(knowledgeExamplesBlock);
  if (competitorReferencesBlock) sections.push(competitorReferencesBlock);
  if (referenceStyleBlock) sections.push(referenceStyleBlock);
  if (researchContextBlock) sections.push(researchContextBlock);

  // 7. Refinement context (single-item refine path)
  if (refinementBlock) sections.push(refinementBlock);

  // 8. <待包装> — the actual KSP list this batch must produce output for. Placed near
  //     the end so model attention is highest on the task object.
  const tierLabel = (tier: number) => tier === 1 ? 'T1，参数领先' : tier === 2 ? 'T2，参数持平' : 'T3，基础配置';
  const itemsList = kspItems.map(i => {
    const hint = i.sloganHint ? ` ${i.sloganHint}` : '';
    return `- ${i.featureName}: ${i.paramValue} (${tierLabel(i.tier)})${hint}`;
  }).join('\n');
  sections.push(`<待包装>\n${itemsList}\n</待包装>`);

  // 9. <指令> — final reminder, recency advantage
  const instruction = `请输出恰好 ${kspItems.length} 个条目，按 <待包装> 内的顺序。\n每个卖点都要认真包装，讲清价值和利益点，L3 子卖点尽可能覆盖所有角度。\n**严格按每行末尾的 [主 Slogan 用 X 型] 决定主 Slogan 类型并填写 l2SloganType；2 条备选请覆盖另外两种类型。**\n只有提示中含"可用极限词"的条目才允许使用"最强""首个""唯一"等极限词。\n具体数字无法确定的统一用大写 X 占位。`;
  sections.push(`<指令>\n${instruction}\n</指令>`);

  return sections.join('\n\n');
}
