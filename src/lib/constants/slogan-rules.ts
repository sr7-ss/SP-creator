/**
 * Slogan生成规则 & 卖点包装手法
 *
 * 这个文件定义了L2 Slogan的生成规则和L3子卖点的包装手法
 * 会被注入到AI Prompt中指导文案生成
 */

/** Definitions of the three slogan types. Used by both packaging and creative agents. */
export const SLOGAN_TYPE_DEFINITIONS = `
## L2 Slogan 三种类型
| 类型 | 含义 | 示例 |
|------|------|------|
| 写实型 (factual) | 直接陈述参数/排位/对比数据，可搭配极限词 | "价位段唯一7000mAh大电池" |
| 功能价值型 (functional) | 把参数优势翻译成用户能感知的好处 | "两天不充电" |
| 情绪价值型 (emotional) | 联名/设计故事/文化属性，或情感共鸣 | "告别电量焦虑" |
`;

/** Vocabulary for 极限词. Only usable when allowExtreme=true (signaled via input hint). */
export const SLOGAN_EXTREME_WORDS = `
## 写实型极限词选取（仅当待包装条目标注"可用极限词"时使用）
| 产品地位 | 对应极限词 |
|---------|-----------|
| 价位段/该国首个 | "首个" / "The first in segment" |
| 价位段/该国最强/最大 | "最强" / "Segment's best" |
| 价位段/该国唯一 | "唯一" / "Segment's only" |
| 价位段第一档 | "第一档" / "Top-tier" |
`;

/** Output quality bar — applies to every Slogan regardless of type. */
export const SLOGAN_QUALITY_BAR = `
## Slogan 质量标准
好的 Slogan 必须同时满足：
1. ≤15 个中文字 或 ≤12 个英文词（先保证表达完整，用户可在界面上交互缩短）
2. 用户看一眼就能理解核心价值
3. 有记忆点——读一遍能复述
4. 不能是任何手机都能说的废话（如"超强性能"、"极致体验"）
`;

/**
 * Backward-compat: full rules used by creative.ts (which still needs the priority
 * heuristic for picking among 5 variants). Packaging core uses the smaller pieces
 * separately + strategy-based hints — no priority heuristic needed.
 */
export const SLOGAN_GENERATION_RULES = `
## L2 Slogan 生成规则
${SLOGAN_TYPE_DEFINITIONS}
主推荐选择优先级（仅作为参考）：有极限词资格 → factual；有联名/文化属性 → emotional；其他 → functional
${SLOGAN_EXTREME_WORDS}
${SLOGAN_QUALITY_BAR}
`;

export const L3_PACKAGING_TECHNIQUES = `
## L3 子卖点包装手法

每个 L3 子卖点使用以下五种手法之一。AI 的作用是：提供包装角度、起名、把技术语言翻译成消费者语言。具体数字如果无法确定，用 X 占位（界面上标蓝色，用户后续填充）。

### 1. 规格陈述 (spec)
直接讲配置数字和技术升级，适用于芯片、充电功率等硬参数。
| 参数 | 好的规格陈述 | 不好的 |
|------|------------|--------|
| 芯片 | "8核CPU，比上代性能提升X%" | "强劲性能" |
| 快充 | "45W闪充，X分钟充至80%" | "快速充电" |
| 存储 | "UFS 3.1，读写速度提升X%" | "高速存储" |

### 2. 场景化 (scenario)
把参数放进用户真实生活场景，让用户代入。
| 参数 | 好的场景化 | 不好的 |
|------|-----------|--------|
| 防水 | "雨天骑车也不怕" | "防水防尘" |
| 大电池 | "出差一天不用带充电宝" | "超长续航" |
| 大存储 | "旅行拍一周不用清内存" | "海量存储" |

### 3. 具象化 (concrete)
把抽象参数翻译成可感知的具体数字。
| 参数 | 好的具象化 | 不好的 |
|------|-----------|--------|
| 7000mAh | "满电追剧X小时不断电" | "超大电量" |
| 256GB | "存X万张照片不用删" | "海量空间" |
| 45W快充 | "午休X分钟充满80%" | "极速充电" |

### 4. 等价换算 (equivalent)
和用户熟知的事物做对比，产生"原来这么厉害"的感觉。
| 参数 | 好的换算 | 不好的 |
|------|---------|--------|
| 7000mAh | "1台顶2台iPhone电量" | "超越同行" |
| 120Hz | "比电影院还流畅" | "高刷体验" |
| VC散热 | "散热面积≈X张信用卡大小" | "高效散热" |

### 5. 极限表达 (extreme)
强调极端场景下的能力，制造记忆点。
| 参数 | 好的极限表达 | 不好的 |
|------|-------------|--------|
| 电池 | "1%电量还能通话30分钟" | "持久耐用" |
| 耐用 | "1.5米跌落也不碎屏" | "坚固耐用" |
| 散热 | "连续X小时游戏不降频" | "高效散热" |

### 手法选择建议
| 卖点类型 | 推荐手法 |
|---------|---------|
| 芯片、充电功率等硬参数 | spec 为主，搭配 concrete |
| 电池、存储等用户日常感知强的 | scenario 或 concrete 为主 |
| 散热、防水等技术型卖点 | spec（讲技术原理）+ scenario（讲使用场景） |
| 需要制造记忆点的 T1 卖点 | equivalent 或 extreme |
`;

export const KSP_TIER_RULES = `
## KSP 分级规则

### 核心决策原则
用户关注度 > 参数领先度。即使参数在价位段最强，如果用户不关心这个参数，也不能放 T1。

### 分级决策矩阵
| 用户关注度 | strong_lead | slight_lead | neutral | slight_lag |
|-----------|-------------|-------------|---------|------------|
| 高（芯片/电池/影像） | → T1 | → T1 或 T2 | → T2 | → T3 |
| 中（屏幕/游戏/耐用/内存/外观） | → T2 | → T2 | → T3 | → 不入选 |
| 低（散热/扬声器/指纹/系统等） | → T2 或 T3 | → T3 | → 不入选 | → 不入选 |

### Tier 定义
- **T1（核心卖点）**：绝对进攻项，最多 3 个。用户关注度高 + 参数明显领先。这是发布会主打的卖点。
- **T2（重要卖点）**：有差异化或中等关注度，支撑竞争力但不构成绝对优势。出现在产品详情页。
- **T3（基础卖点）**：同质化配置，各家差不多，属于"有就行"。出现在参数表。

### 特殊规则
- T1 绝对不超过 3 个
- 三个 Tier 都必须有条目
- 低端产品如果高关注参数不够强，可以将 2-3 个 T2 合并打包为 T1
`;
