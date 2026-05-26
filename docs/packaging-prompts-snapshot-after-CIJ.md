# 卖点包装 Prompt 快照（A+E+F+B+C+I+J 完成后）

记录时间：策略路由 + 条件 hint + UI 弹窗 + schema 字段 全部完成后。

---

## 本轮（C+I+J）的改动总览

### J：Schema 字段
- `prisma/schema.prisma` 的 `Project` 模型加 `packagingStrategy: String?`
- `npx prisma db push` 已执行
- Prisma client 已重新生成

### C：策略路由 + 条件 hint
- 新文件：`src/lib/constants/slogan-strategies.ts`
  - 定义 `PACKAGING_STRATEGIES`（value-for-money / premium / tech-flagship 三种）
  - 每种策略按 (paramLead / paramParity / noAdvantage) 三个场景给 `{sloganType, allowExtreme}`
  - 提供 `decideSloganTypeForKsp(strategy, tier)` 和 `formatSloganHint(decision)`
- `src/lib/constants/slogan-rules.ts` 拆分：
  - 原 `SLOGAN_GENERATION_RULES`（含 Step 1 类型选择决策）拆为 3 个独立 export：
    - `SLOGAN_TYPE_DEFINITIONS`（3 种类型的定义）
    - `SLOGAN_EXTREME_WORDS`（极限词词表）
    - `SLOGAN_QUALITY_BAR`（输出质量标准）
  - 原 `SLOGAN_GENERATION_RULES` 保留为向后兼容包装（仍含 Step 1 优先级，给 creative agent 用）
- `src/lib/ai/prompts/packaging.ts`：
  - 改用 3 个小 export 拼装 L2 段，**删除 Step 1 的优先级表**（决策已搬到代码）
  - 加 `sloganHint?: string` 到 `spItems` 元素，自动追加到 `<待包装>` 行尾
  - `<指令>` 改写：明确"按行尾 [主 Slogan 用 X 型] 决定主类型"
  - few-shot `<案例>` 输入加 hint：
    - 案例 1（电池 T1）：`[主 Slogan 用写实型，可用极限词]`
    - 案例 2（芯片 T1）：`[主 Slogan 用功能型]`
  - few-shot 输出对齐：案例 1 主 = factual placeholder，案例 2 主 = functional placeholder
- `src/lib/ai/packaging-core.ts`：
  - 新增 `packagingStrategy?: string` 参数
  - 用 `decideSloganTypeForKsp` 给每个 SP 算 hint，注入 `itemsWithHints`
  - missing-items retry 的 prompt 也带 hint

### I：UI 弹窗
- `src/components/packaging/PositioningDialog.tsx`：
  - `ProductPositioning` 接口加 `packagingStrategy?: string`
  - 新增策略选择区（3 个 radio 卡片），默认 value-for-money
  - `onConfirm` 回调带上 strategy
- `src/app/projects/[id]/page.tsx`：
  - 弹窗确认后：
    - 立即 PATCH `/api/projects/[id]` 保存 strategy（非阻塞）
    - 把 strategy 传给 packaging API
  - 弹窗 `initial` 从 project 读取（包括存过的 strategy）
- `src/app/api/ai/packaging/route.ts`：
  - 接收 `packagingStrategy` 和 `projectId` body 字段
  - body 没传时回退到 project.packagingStrategy（从 DB 读取）
- 项目数据类型 `ProjectData` 加 4 个 nullable 字段

---

## System Prompt 关键变化

### `<规则>` 的 L2 段（替换原 SLOGAN_GENERATION_RULES）

**旧版**（包含 Step 1 priority 表）：
```
## L2：Slogan
[SLOGAN_GENERATION_RULES 内含 Step 1 类型选择优先级表 + Step 2 极限词 + Step 3 质量标准]
重要：生成 1 条主 Slogan + 2 条备选...
注意：只有输入中标注"T1，参数领先"的卖点才有极限词资格，T2/T3 不能用...
```

**新版**（用 3 个小 export 拼装）：
```
## L2：Slogan
[SLOGAN_TYPE_DEFINITIONS — 仅类型定义，无优先级]
[SLOGAN_EXTREME_WORDS — 极限词词表]
[SLOGAN_QUALITY_BAR — 质量标准]

重要：每个 SP 在 <待包装> 块里的行尾会有一条**决策提示**，形如 [主 Slogan 用写实型，可用极限词] 或 [主 Slogan 用功能型]。**主 Slogan 必须严格按提示的类型生成**，并把对应的 type 字段填进 l2SloganType；2 条备选请覆盖另外两种类型，让用户后续可切换。
只有提示中标注"可用极限词"的条目才允许使用"最强"/"首个"/"唯一"/"第一档"等极限词；否则禁用。
```

### `<示例>` 的 few-shot 输入

**旧版**：
```
- 电池: 7000mAh (T1，参数领先)
- 芯片: 第五代骁龙8至尊版 (T1，参数领先)
```

**新版**（输入行带 hint）：
```
- 电池: 7000mAh (T1，参数领先) [主 Slogan 用写实型，可用极限词]
- 芯片: 第五代骁龙8至尊版 (T1，参数领先) [主 Slogan 用功能型]
```

输出对齐：
- 案例 1：`l2Slogan` 是 factual placeholder，`l2SloganType: "factual"`
- 案例 2：`l2Slogan` 是 functional placeholder，`l2SloganType: "functional"`

---

## User Prompt 关键变化

### `<待包装>` 块（每行末尾加 hint）

**旧版**：
```
<待包装>
- 电池: 7000mAh (T1，参数领先)
- 芯片: 天玑8400 (T1，参数领先)
- 屏幕: 6.78英寸 OLED 120Hz (T2，参数持平)
- 防护: IP64 (T3，基础配置)
</待包装>
```

**新版（value-for-money 策略）**：
```
<待包装>
- 电池: 7000mAh (T1，参数领先) [主 Slogan 用写实型，可用极限词]
- 芯片: 天玑8400 (T1，参数领先) [主 Slogan 用写实型，可用极限词]
- 屏幕: 6.78英寸 OLED 120Hz (T2，参数持平) [主 Slogan 用功能型]
- 防护: IP64 (T3，基础配置) [主 Slogan 用情绪型]
</待包装>
```

**新版（premium 策略，对比）**：
```
<待包装>
- 电池: 7000mAh (T1，参数领先) [主 Slogan 用情绪型]
- 芯片: 天玑8400 (T1，参数领先) [主 Slogan 用情绪型]
- 屏幕: 6.78英寸 OLED 120Hz (T2，参数持平) [主 Slogan 用情绪型]
- 防护: IP64 (T3，基础配置) [主 Slogan 用情绪型]
</待包装>
```

**新版（tech-flagship 策略）**：
```
<待包装>
- 电池: 7000mAh (T1，参数领先) [主 Slogan 用写实型，可用极限词]
- 芯片: 天玑8400 (T1，参数领先) [主 Slogan 用写实型，可用极限词]
- 屏幕: 6.78英寸 OLED 120Hz (T2，参数持平) [主 Slogan 用写实型]
- 防护: IP64 (T3，基础配置) [主 Slogan 用功能型]
</待包装>
```

### `<指令>` 块

新增了"按行尾 hint 决定主类型"的强调：

```
<指令>
请输出恰好 4 个条目，按 <待包装> 内的顺序。
每个卖点都要认真包装，讲清价值和利益点，L3 子卖点尽可能覆盖所有角度。
**严格按每行末尾的 [主 Slogan 用 X 型] 决定主 Slogan 类型并填写 l2SloganType；2 条备选请覆盖另外两种类型。**
只有提示中含"可用极限词"的条目才允许使用"最强""首个""唯一"等极限词。
具体数字无法确定的统一用大写 X 占位。
</指令>
```

---

## 策略对照表

| 策略 | T1 paramLead | T2 paramParity | T3 noAdvantage | 适用产品类型 |
|---|---|---|---|---|
| `value-for-money` | factual + 极限词 | functional | emotional | 性价比/中低端（你现在做的）|
| `premium` | emotional | emotional | emotional | 高端/旗舰，弱化参数 |
| `tech-flagship` | factual + 极限词 | factual | functional | 极客/技术派 |

---

## 接下来的方向

C+I+J 之后还可以做（之前讨论过的）：

- **B 已完成**：few-shot 占位符 + 砍 BANNED_PHRASES
- **G**：知识库匹配用 synonym map（替换 substring contains）—— `direction-map.ts` 已有同义词体系，搬过来就行
- **H**：砍 legacy Knowledge 表查询（DB 通了，可以做了——先查表是不是空的再决定）

不在已讨论列表里、但值得考虑的：

- 策略弹窗的"自定义"档位：让高级用户在 UI 上覆盖每个 SP 的 sloganType（场景：用户对某一条特别有想法）
- 策略改写 chip 例子：现有 few-shot 案例 2 是"T1 + functional"，看起来与 value-for-money 的"T1 → factual"规则不一致；可以解释成"premium 策略下 T1 → emotional 的中间过渡"，或者把案例 2 改成 T2 + functional 让规则一致性更清晰
