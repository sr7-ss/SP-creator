# SP Creator — AI 驱动的手机卖点策划引擎

## 产品定位

面向手机品牌产品经理和营销人员的 AI 工具，帮助用户完成从市场调研 → 竞品参数对比 → SP（Selling Point）分级 → 卖点包装全流程。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) + React 19 + TypeScript |
| 数据库 | PostgreSQL (Neon Serverless) + Prisma 6 |
| 认证 | NextAuth.js v5 |
| AI | @anthropic-ai/sdk，支持 5 家模型供应商（Claude / OpenAI / Gemini / Minimax / 智谱） |
| UI | shadcn/ui + Tailwind CSS 4 + Lucide Icons |
| 导出 | xlsx / pptxgenjs / html2canvas-pro |
| 国际化 | next-intl（中/英） |

## 核心工作流（4 步）

```
1. Deep Research（市场调研） → 抓取用户评论、竞品话术、市场趋势
2. 参数对比（Competitive Analysis） → 导入/爬取竞品参数，规则引擎分析优劣
3. SP 分级（Tier 1/2/3） → AI + 规则引擎自动划分卖点层级
4. 卖点包装（Packaging） → 生成 L1 命名 / L2 Slogan / L3 细节描述
```

## AI Agent 系统

4 个专用 Agent，各自独立：

| Agent | 功能 | 文件 |
|-------|------|------|
| Discovery | 自动发现竞品，爬取 GSMArena/91mobiles 等网站参数 | `src/lib/ai/agents/discovery.ts` |
| Research | 深度市场调研：Serper 搜索 → 网页抓取 → LLM 分析 → 结构化报告 | `src/lib/ai/agents/research.ts` |
| Creative | 批量生成 slogan 变体，自评打分 | `src/lib/ai/agents/creative.ts` |
| Review Mining | 批量分析用户评论，提取主题/情绪，建议 SP 调整 | `src/lib/ai/agents/review-mining.ts` |

### Research Agent 架构（直接 Pipeline，不走 tool_use）

```
用户输入（中文） → buildSearchQuery() 提取关键词转英文
  → Serper.dev 搜索（主） / Brave Search（备） / Google HTML（兜底）
  → fetchPage() 抓取搜索结果页面（跳过 Amazon/Flipkart 等反爬站）
  → 单次 LLM 调用，输入所有 snippet + 页面内容，输出结构化 JSON
  → SSE 流式返回进度 + 最终报告
```

之所以不用 Agent tool_use 循环：智谱 GLM-4-Flash（免费模型）无法可靠处理 tool_use 协议。

### AI 多供应商路由

- 每种任务类型（轻量/分析/创意/调研）可独立配置不同模型
- 用户自带 API Key，加密存储在数据库
- 支持免费模型（智谱 GLM-4-Flash）
- 支持供应商：Claude / OpenAI / Gemini / Minimax / 智谱

## Prompt 工程架构

本项目**不用 RAG / 不做 fine-tuning**，采用 **Prompt Injection / Context Injection** — 在 System Prompt 之外动态拼接上下文变量。规则频繁迭代，改 prompt 比训模型或建索引快得多。

### 两层 Prompt

- **System Prompt**（不变）：角色 + 规则 + 输出格式 + Few-shot。文件：`src/lib/ai/prompts/packaging.ts`（短/全两版）
- **User Prompt**（动态）：SP 条目 + 知识库匹配 + 调研上下文 + 参考项目风格

### XML 标签分区

System Prompt 用 `<role>` `<task>` `<rules>` `<brand_rules>` `<examples>` `<output_format>`；User Prompt 用 `<knowledge_examples>` `<competitor_references>` `<research_context>` `<reference_style>`。

XML 非 Claude 专属（GPT-4 / Gemini 对 XML/Markdown 等效），但统一用 XML 是为了免费小模型（智谱 GLM-4-Flash）也能可靠分节。

### Few-shot 的作用：教格式/质量，不是教内容

Few-shot 里出现的具体词（如"青海湖电池"）**只是示范包装技法**。真实品牌营销名必须通过知识库 `brand_name` 条目注入，不能混入示例。

### 知识库注入策略（按 feature 精确匹配）

| entryType | 注入位置 |
|-----------|---------|
| `brand_name` | `<brand_rules>` |
| `packaging` | `<knowledge_examples>` |
| `competitor` | `<competitor_references>` |
| `rule` | `<rules>` 节内 |

只注入和当前 SP 条目 feature 匹配的条目，不做向量检索。

### 原创性验证（`packaging-core.ts`）

- L1 / L2 必须原创（品牌命名和主标语是差异化资产）
- L3 拆解维度可套用行业标准（电池永远是 续航/长寿/轻薄/安全/快充 几个角度）
- 生成后对 L1/L2/alternatives 检查 `BANNED_PHRASES`（黑名单 + Few-shot 里出现过的词）
- **违规时仅重试违规的条目**，不重跑整批

## 目录结构

```
src/
├── app/
│   ├── api/                      # 30+ API 路由
│   │   ├── ai/                   # AI 相关（agent-stream, analyze, packaging, chat, reviews）
│   │   ├── projects/[id]/        # 项目 CRUD + products + sp-results
│   │   ├── research/             # 调研报告存储
│   │   ├── knowledge/            # 知识库
│   │   ├── markets/              # 市场管理
│   │   └── user/                 # AI Key 管理 + 用量统计
│   ├── projects/[id]/page.tsx    # 主工作台（参数表 + SP 看板 + 包装编辑器）
│   ├── research/page.tsx         # Deep Research 页面
│   ├── reviews/page.tsx          # 评论挖掘页面
│   ├── knowledge/page.tsx        # 知识库管理
│   ├── regions/                  # 区域市场管理
│   └── settings/page.tsx         # 设置（AI Key + 模型选择 + 任务路由）
├── components/
│   ├── sp-board/                # SP 看板（Tier 拖拽排序）
│   ├── packaging/                # L1/L2/L3 包装编辑器
│   ├── param-table/              # 参数对比表格
│   ├── reviews/                  # 评论分析 UI
│   ├── agent/                    # Agent 进度面板
│   └── ui/                       # shadcn 基础组件
├── lib/
│   ├── ai/
│   │   ├── agents/               # 4 种 Agent
│   │   ├── prompts/              # LLM Prompt 模板
│   │   ├── agent-runner.ts       # 通用 Agent 循环（tool_use 协议）
│   │   ├── provider.ts           # 多模型供应商适配器
│   │   └── packaging-core.ts     # 包装生成核心逻辑
│   ├── analysis/
│   │   ├── rule-engine.ts        # 规则引擎（确定性 SP 分级）
│   │   ├── spec-scraper.ts       # 参数爬虫（GSMArena / 91mobiles）
│   │   └── text-parser.ts        # 文本参数提取
│   ├── settings.ts               # 设置管理（localStorage + 任务路由）
│   └── useAgentStream.ts         # SSE 流式 Agent Hook
├── types/index.ts                # 核心类型定义
└── middleware.ts                 # 认证中间件

prisma/schema.prisma              # 数据库模型（15 张表）
```

## 数据库核心模型

| 表 | 用途 |
|----|------|
| Project | 项目（名称、价位段、市场） |
| Product | 产品（自有/竞品，JSON 参数） |
| SpResult | SP 条目（tier 1-3, L1/L2/L3 包装文案） |
| Analysis | 竞品分析结果 |
| ResearchReport | 调研报告（summary, insights, competitor messaging, sources） |
| ReviewBatch + ReviewItem | 评论批量分析 |
| KnowledgeEntry | 知识库条目（包装模板、竞品话术） |
| UserAIKey | 加密存储的 AI API Key |
| UsageLog | Token 用量 + 积分追踪 |

Project 表新增字段（战区 2D 坐标 + 定位注入用）：

- `launchDate: DateTime?`
- `targetAudience: String?`
- `productStyle: String?`（JSON 数组）
- `positioning: String?`

改动后 `npx prisma db push`。

## 核心类型

```typescript
// SP 条目
interface SpItem {
  tier: 1 | 2 | 3;
  featureName: string;        // "电池"
  l1Name: string;             // "8000mAh Titan Battery"
  l2Slogan: string;           // "两天不充电"
  l2SloganType: 'factual' | 'functional' | 'emotional';
  l3Details: L3SubPoint[];    // 子卖点（concrete / equivalent / extreme 技法）
}

// 调研报告
interface ResearchReport {
  summary: string;
  topPros: ResearchMention[];  // Top 5 优点（含提及率 + 用户原话）
  topCons: ResearchMention[];  // Top 5 缺点
  competitorMessaging: CompetitorMessagingItem[];
  spRecommendations: string[];
  sources: { url, type, snippetCount }[];
}

interface ResearchMention {
  rank: number;
  topic: string;              // "Battery Life"
  mentionRate: string;        // "68%"
  finding: string;
  quotes: string[];           // 真实用户评论摘录
}

// 竞品分析
interface AnalysisItem {
  feature: string;
  ownValue: string;
  competitorValues: Record<string, string>;
  leadLevel: 'strong_lead' | 'slight_lead' | 'neutral' | 'slight_lag' | 'strong_lag';
}
```

## 关键模块索引

| 模块 | 职责 |
|------|------|
| `src/lib/constants/slogan-rules.ts` | `SLOGAN_GENERATION_RULES` / `L3_PACKAGING_TECHNIQUES` / `SP_TIER_RULES` |
| `src/lib/constants/direction-map.ts` | Feature 显示名权威来源 |
| `src/lib/ai/prompts/packaging.ts` | Packaging System/User Prompt |
| `src/lib/ai/packaging-core.ts` | 知识库查询 + 上下文拼接 + 原创性验证 + 违规重试 |
| `src/components/packaging/PackagingDetailView.tsx` | 左编辑 / 右对话分屏，可拖拽 |
| `src/components/packaging/ItemChatPanel.tsx` | 按 item.id 隔离的上下文聊天 |
| `src/components/packaging/PositioningDialog.tsx` | 目标用户 + 调性 + 参考项目 + 知识库模板 |
| `src/components/packaging/ResearchContextPicker.tsx` | 勾选调研结论注入 packaging |
| `src/app/api/ai/parse-document/route.ts` | PDF (pdf-parse) / PPTX (XML regex) / TXT 解析 |

## SP 分级规则

- T1 不超过 3 个
- 用户关注度权重 > 参数领先度
- 参数权重：第一档（芯片/电池/影像）> 第二档（屏幕/游戏/耐用/内存/外观）> 第三档

## Slogan 类型判定

见 `src/lib/constants/slogan-rules.ts` → `SLOGAN_GENERATION_RULES`。

| 条件 | 推荐类型 |
|------|---------|
| 参数领先（段位最强/唯一/首个） | **写实型** + 极限词 |
| 参数持平 | **功能价值型**（翻译参数为用户可感知功能） |
| 无参数优势但有联名/设计/文化 | **情绪价值型** |

字数限制：≤15 中文字 / ≤12 英文词。X 大写作为数字占位符。

## L3 包装五种技法

见 `src/lib/constants/slogan-rules.ts` → `L3_PACKAGING_TECHNIQUES`。每个 L3 子卖点至少选一种：

1. **参数型（spec）** — 直接陈述数字/规格
2. **场景型（scenario）** — 绑定具体使用场景
3. **具象化（concrete）** — 抽象参数变可感知物体
4. **等价换算（equivalent）** — 用熟悉事物做量级类比
5. **极限表达（extreme）** — 用极限词强调（需有资格）

常量文件内有每种技法的 good/bad 对照表。

## UI 设计规范

- **色调**: 银白色为主，科技蓝(blue-600)为点缀色
- **按钮**: 大按钮用 `bg-slate-800`（深色），操作按钮用 `bg-blue-600`
- **风格**: 极简，大量留白，卡片式布局
- **交互**: hover 显示编辑/删除图标，拖拽式 SP 看板

## 页面路由

| 路由 | 用途 |
|------|------|
| `/` | 首页，4 模块入口卡片 |
| `/regions` | 所属战区（国家列表） |
| `/regions/[market]` | 国家产品列表（按价位段分组） |
| `/projects/[id]` | 主工作台（参数表 + SP 看板 + 包装编辑器 + 导出） |
| `/research` | Deep Research（4 种快捷调研 + Agent 进度 + 内联报告） |
| `/reviews` | 评论挖掘（批量上传 + 主题分析） |
| `/knowledge` | 知识库管理 |
| `/settings` | AI 配置（Key + 模型 + 任务路由 + 用量） |

## 环境变量

```
DATABASE_URL / DIRECT_DATABASE_URL  # Neon PostgreSQL
NEXTAUTH_URL / NEXTAUTH_SECRET      # 认证
ENCRYPTION_KEY                       # AI Key 加密
SERPER_API_KEY                       # 网页搜索（主）
BRAVE_SEARCH_API_KEY                 # 网页搜索（备）
```

## 已完成功能

- [x] 项目骨架 + 全局布局（Sidebar + Header）
- [x] 银白科技风 UI + 中英文双语
- [x] 所属战区管理（国家 CRUD）
- [x] 项目创建/管理 + 已上市状态
- [x] 参数对比表格（SmartPaste 智能粘贴 + 爬虫导入）
- [x] AI 竞品分析（规则引擎 + LLM）
- [x] SP 自动分级 + 拖拽看板
- [x] 三层卖点包装（L1/L2/L3）+ 版本控制
- [x] Deep Research Agent（Serper 搜索 + 网页抓取 + 结构化报告）
- [x] 评论挖掘 Agent（批量分析 + SP 调整建议）
- [x] Creative Agent（slogan 变体生成 + 自评）
- [x] Discovery Agent（竞品自动发现 + 参数爬取）
- [x] 知识库管理
- [x] 导出 Excel / PPT / 截图
- [x] 多 AI 供应商支持（5 家）+ 任务路由
- [x] 积分系统 + 用量统计

## 计划中功能

- [ ] **4 个 Agent 的 System Prompt 按 Anthropic 7 原则重写** — discovery / research / creative / review-mining（packaging 已完成）
- [ ] **知识库内容填充** — 电池规则、品牌 IP 营销名、芯片数据、散热模板
- [ ] 四种调研类型差异化 prompt 和输出模板（评论分析 / 竞品对比 / 趋势 / 全面调研）
- [ ] Chatbot 对话模式（用户输入目标，系统自动编排多 Agent 执行全流程）
- [ ] 多模型选择器（从主 UI 可直接切换）

## 设计决策（为什么不 X）

- **不用 RAG** — feature name 精确匹配即可覆盖本场景，向量检索的复杂度/成本不值得
- **不做 fine-tuning** — 规则还在迭代，改 prompt 比训模型快 100 倍
- **Research Agent 不走 tool_use** — 免费模型（GLM-4-Flash）对 tool_use 协议支持不可靠
- **L3 存 `SpResult.l3Details`（JSON）而非独立表** — L3 永远跟着 SP 走，不独立查询

## 注意事项

- Research Agent 用直接 Pipeline（不走 tool_use），兼容免费模型
- `DialogTrigger` 不要用 `asChild` 包裹 `<button>`，会导致嵌套 button 报错
- Dev server: `npm run dev`，端口 3000
- 数据库变更后运行 `npx prisma db push`
- **Feature 显示名的权威来源是 `direction-map.ts`** — `TierCard` / `CATEGORY_KEYWORDS` / `PARAM_DISPLAY_NAMES` 必须对齐，否则同一条目会以不同名字出现两次（踩过：芯片/处理器、防护/防护等级）
- **Unranked 条目要用 `PARAM_DISPLAY_NAMES[key]` 映射成显示名**，不能直接透传 `platform.chipset` 这种 key
- **不用正则提取语义 tag** — 让 AI 返回 `tags` 字段，缺失时按 `sloganType` 兜底
- **`pdf-parse` 动态 import**：`const mod = await import('pdf-parse') as any; const pdfParse = mod.default || mod;`
- **AI 供应商高峰错误**（如 Gemini 503）用 `friendlyError()` 包装成中文提示
