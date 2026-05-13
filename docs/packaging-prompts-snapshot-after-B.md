# 卖点包装 Prompt 快照（A+E+F+B 完成后）

记录时间：B 改动完成后。

**和上一份快照（`packaging-prompts-snapshot.md`）的差异**：
- `<规则>` 的 L1 表："7000mAh Titan Battery" / "50MP OIS 超感光主摄" → "7000mAh [营销名]" / "50MP OIS [营销名]"
- `<示例>` 引言新增一行说明 `[xxx]` 占位符的使用约定
- `<案例>` #1 电池：l2Slogan + 2 个 alternatives 改成占位符
- `<案例>` #2 芯片：l2Slogan + 2 个 alternatives 改成占位符
- L3 子卖点保留具体词（项目原则：L3 角度可以照搬）
- L1 的"第五代骁龙8至尊版"保留（这是纯参数 L1，不是营销名）

**代码层同步**：
- 删除 `packaging-core.ts` 的 `BANNED_PHRASES` 列表
- 删除 `findViolations` 函数
- 删除 originality violation 检测 + 重试块（~75 行）
- 单次包装请求平均省 1 次 API 调用

---

## System Prompt

注：仅展示 B 改动涉及的 `<规则>` L1 表片段 + `<示例>` 全文。
其他段落（`<角色>` / `<任务>` / `<规则>` 其余部分 / `<品牌规则>` / `<输出格式>`）与上一版相同。

### 变更片段 1：`<规则>` 里的 L1 表

```
## L1：卖点命名（两种模式）
| 模式 | 适用场景 | 示例 |
|------|---------|------|
| 纯参数 | 参数本身就是卖点名，用户一看就懂 | 芯片→"天玑7300"、防护→"IP64" |
| 参数+营销名 | 参数需要包装才有记忆点 | 电池→"7000mAh [营销名]"、影像→"50MP OIS [营销名]" |  ★ 改
```

### 变更片段 2：`<示例>` 整段

```
<示例>
注意：
- 示例中的 [xxx] 是占位符，标注了"该位置应当生成什么类型/方向的内容"。输出时按方向自行创作具体文案，**不要保留中括号、不要照抄占位符里的提示语**     ★ 新增
- L1 营销名和 L2 Slogan 必须原创（学习句式结构，禁止照抄）
- L3 子卖点的角度和手法可以照搬（行业通用参数维度就这些）
<案例>
<输入>
- 电池: 7000mAh (T1，参数领先)
</输入>
<输出>
{
  "packagingResults": [
    {
      "featureName": "电池",
      "tier": 1,
      "l1Name": "7000mAh [营销名]",
      "l2Slogan": "[功能型示例：把电池参数翻译成用户可感知的好处，≤15字]",          ★ 改
      "l2SloganType": "functional",
      "l2Alternatives": [
        { "text": "[写实型示例：参数+极限词，仅 T1 参数领先可用]", "type": "factual" },   ★ 改
        { "text": "[情绪型示例：情感钩子或价值共鸣]", "type": "emotional" }              ★ 改
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
- 芯片: 第五代骁龙8至尊版 (T1，参数领先)
</输入>
<输出>
{
  "packagingResults": [
    {
      "featureName": "芯片",
      "tier": 1,
      "l1Name": "第五代骁龙8至尊版",
      "l2Slogan": "[功能型示例：把性能参数翻译成用户可感知的长期体验，≤15字]",       ★ 改
      "l2SloganType": "functional",
      "l2Alternatives": [
        { "text": "[写实型示例：跑分/排位/同档位对比数据]", "type": "factual" },         ★ 改
        { "text": "[情绪型示例：性能+第二维度并列，如冷静/丝滑/省电]", "type": "emotional" }   ★ 改
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
```

---

## User Prompt

**没有变化**。结构与上一份快照完全相同。

---

## packaging-core.ts 删除清单（B 改动）

| 删除项 | 行数（旧） | 删除原因 |
|---|---|---|
| `BANNED_PHRASES` 常量数组 | 365-368 | 黑名单已无意义——few-shot 不再包含具体词，模型抄不到 |
| `findViolations` 函数 | 370-389 | 没有黑名单，无需检测 |
| Originality 违规检测 + 重试块 | 391-435 | 没有违规检测，无需重试 |
| **总计删除** | **~75 行** | — |

新增：一段 7 行注释，说明"为什么不再做 originality validation"，留给未来读者。

---

## 接下来：C + I + J

参考`docs/packaging-prompts-snapshot-after-B.md` 这份快照作为 C 改动的基线。
C 会大改 `<规则>` 的 L2 段和 `<示例>` 块（删 SLOGAN_GENERATION_RULES Step 1 + 改成按 tier/leadLevel 动态选 few-shot）。
