'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X, Loader2, Trash2, Bot, Sparkles, Wand2, Swords, MessageSquare, Check, Plus, Combine, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KspItem, SloganType } from '@/types';
import { loadSettings, getConfigForTask, AppSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import ModelSelector from '@/components/ModelSelector';

// ─── Types ───────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface VariantSuggestion {
  l1Name?: string;
  l2Slogan: string;
  l2SloganType: SloganType;
  score?: number;
  rationale?: string;
  tags?: string[];
}

interface ParsedContent {
  text: string;
  variants?: VariantSuggestion[];
}

interface BlockContext {
  id: string;
  type: string;
  label: { zh: string; en: string };
  guide: { zh: string; en: string };
  pills: { zh: string; en: string; prompt: (item: KspItem, zh: boolean) => string }[];
  index?: number;
}

interface ItemChatPanelProps {
  item: KspItem;
  productName: string;
  segment?: string;
  competitorContext?: string;
  projectContext: string;
  projectId: string;
  onApply: (itemId: string, updates: Partial<KspItem>) => void;
  locale: string;
  activeContext?: BlockContext | null;
}

// ─── Constants ───────────────────────────────────────────────

const sloganTypeColors: Record<SloganType, string> = {
  factual: 'bg-slate-50 text-slate-800 border-slate-300',
  functional: 'bg-green-50 text-green-600 border-green-200',
  emotional: 'bg-purple-50 text-purple-600 border-purple-200',
};

const sloganTypeLabels: Record<SloganType, { zh: string; en: string }> = {
  factual: { zh: '事实型', en: 'Factual' },
  functional: { zh: '功能型', en: 'Functional' },
  emotional: { zh: '情感型', en: 'Emotional' },
};

// ─── Helpers ─────────────────────────────────────────────────

function buildItemContext(item: KspItem, productName: string, segment?: string, competitorContext?: string, projectContext?: string, locale?: string): string {
  const zh = locale === 'zh';
  const altText = item.l2Alternatives?.map(a => `"${a.text}" (${a.type})`).join(', ') || (zh ? '无' : 'None');
  const l3Text = item.l3Details?.map(d => `${d.name}: ${d.description} [${d.technique}]`).join('\n  ') || (zh ? '无' : 'None');

  // Truncate project context to keep prompt reasonable
  const truncatedProjectCtx = projectContext && projectContext.length > 1500
    ? projectContext.slice(0, 1500) + '...'
    : projectContext || '';

  if (zh) {
    return `你是一位卖点包装专家，正在帮用户优化一个具体的产品卖点。

## 当前卖点信息
- 产品: ${productName}${segment ? ` (${segment})` : ''}
- 功能参数: ${item.featureName}
- 参数值: ${item.paramValue}
- 所属层级: T${item.tier}
- L1 卖点名称: ${item.l1Name || '未生成'}
- L2 Slogan: "${item.l2Slogan || '未生成'}" (${item.l2SloganType || '未设定'})
- L2 备选方案: ${altText}
- L3 子卖点:
  ${l3Text}

## 项目背景
${truncatedProjectCtx}

## 你的风格
- **先给结论/核心观点**，再简要展开 2-3 个要点
- 简洁有力，不啰嗦，像高级顾问一样直接给方案
- **积极鼓励**：肯定用户好的选择，激发创新灵感，让用户觉得"这个方向选对了"
- 当给出建议时，要有感染力，让人想立刻行动
- 当用户请求"变体方案"、"换几个方案"、"帮我微调"等优化请求时，不要输出大段分析，直接在回复末尾附上结构化 JSON（用 \`\`\`json 包裹）：
\`\`\`json
{
  "type": "variants",
  "variants": [
    { "tags": ["更有冲击力", "情感共鸣"], "l2Slogan": "...", "l2SloganType": "factual|functional|emotional", "score": 8, "rationale": "一句话说明思路" },
    { "tags": ["场景化", "易记忆"], "l2Slogan": "...", "l2SloganType": "factual|functional|emotional", "score": 7, "rationale": "一句话说明思路" }
  ]
}
\`\`\`
- tags 字段（必填，不能省略）：2-3 个关键词标签，每个标签是一个独立的词语（2-3个字），不是句子。用来概括这条方案的核心优势。
  示例：如果 rationale 是"强调电池的耐用性和性能，提升用户对产品品质的认知"，那 tags 应该是 ["耐用性", "性能", "品质"]
  再示例：如果方案偏情感方向，tags 可以是 ["冲击力", "记忆点", "共鸣"]
  错误示例（不要这样）：["强调电池的耐用性"] — 这是句子片段，不是关键词
- rationale：一句话简短思路，不要长段分析
- 如果用户的请求涉及修改 L1 名称，也在 variants 中加入 "l1Name" 字段
- 评分标准：10 分制，从创意力、记忆度、与卖点匹配度三个维度综合评分
- 只生成 3 个变体，覆盖不同类型（事实型/功能型/情感型）`;
  }

  return `You are a selling point packaging expert helping optimize a specific product selling point.

## Current Selling Point
- Product: ${productName}${segment ? ` (${segment})` : ''}
- Feature: ${item.featureName}
- Value: ${item.paramValue}
- Tier: T${item.tier}
- L1 Name: ${item.l1Name || 'Not generated'}
- L2 Slogan: "${item.l2Slogan || 'Not generated'}" (${item.l2SloganType || 'Not set'})
- L2 Alternatives: ${altText}
- L3 Benefits:
  ${l3Text}

## Project Background
${truncatedProjectCtx}

## Your Style
- **Lead with conclusions/core insight**, then expand with 2-3 key points
- Concise and impactful — like a senior consultant giving direct recommendations
- **Encourage and inspire**: affirm good choices, spark creative thinking
- When the user asks for variants, refinement, or optimization, skip long analysis and append structured JSON at the end (wrapped in \`\`\`json):
\`\`\`json
{
  "type": "variants",
  "variants": [
    { "tags": ["more impactful", "emotional"], "l2Slogan": "...", "l2SloganType": "factual|functional|emotional", "score": 8, "rationale": "one-line reasoning" }
  ]
}
\`\`\`
- tags (required): exactly 3 short keywords (2-4 words each), e.g. ["durability", "performance", "quality"]. No sentences, just words
- Generate exactly 3 variants covering different types (factual/functional/emotional)`;
}

/** Parse assistant message content to extract text and optional variant cards */
function parseMessageContent(content: string): ParsedContent {
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  let textPart = content;
  let variants: VariantSuggestion[] | undefined;

  const matches = [...content.matchAll(jsonBlockRegex)];
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.type === 'variants' && Array.isArray(parsed.variants)) {
        variants = parsed.variants.map((v: Record<string, unknown>) => ({
          l1Name: typeof v.l1Name === 'string' ? v.l1Name : undefined,
          l2Slogan: String(v.l2Slogan || ''),
          l2SloganType: (['factual', 'functional', 'emotional'].includes(v.l2SloganType as string)
            ? v.l2SloganType : 'functional') as SloganType,
          score: typeof v.score === 'number' ? v.score : undefined,
          rationale: typeof v.rationale === 'string' ? v.rationale : undefined,
          tags: Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string') : undefined,
        }));
        textPart = textPart.replace(match[0], '').trim();
      }
    } catch { /* not valid JSON, keep as text */ }
  }

  return { text: textPart, variants };
}

function scoreColor(score: number): string {
  if (score >= 8) return 'text-green-600 bg-green-50';
  if (score >= 6) return 'text-amber-600 bg-amber-50';
  return 'text-red-500 bg-red-50';
}


/** Convert raw API errors to friendly messages */
function friendlyError(msg: string): string {
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(msg)) {
    return '抱歉亲爱的，模型暂时繁忙，更换模型再试试吧～';
  }
  if (/429|rate.?limit|too many/i.test(msg)) {
    return '请求太频繁了，稍等一下再试～';
  }
  if (/401|unauthorized|invalid.*key/i.test(msg)) {
    return 'API Key 无效或已过期，请在设置中检查～';
  }
  if (/timeout|timed.?out/i.test(msg)) {
    return '响应超时了，换个模型或稍后再试～';
  }
  return `出错了: ${msg}`;
}

// ─── Component ───────────────────────────────────────────────

export default function ItemChatPanel({
  item,
  productName,
  segment,
  competitorContext,
  projectContext,
  projectId,
  onApply,
  locale,
  activeContext,
}: ItemChatPanelProps) {
  const zh = locale === 'zh';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [aiSettings, setAiSettings] = useState<AppSettings>(() => loadSettings());
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const prevContextId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevItemId = useRef<string>(item.id);

  // Show guide when activeContext changes to a new block
  useEffect(() => {
    const newId = activeContext?.id || null;
    if (newId !== prevContextId.current) {
      prevContextId.current = newId;
      if (newId) setShowGuide(true);
    }
  }, [activeContext]);

  // Storage key per item
  const storageKey = `chat_item_${item.id}`;

  // Load history on mount / item change
  useEffect(() => {
    if (item.id !== prevItemId.current) {
      prevItemId.current = item.id;
      // Abort any in-flight request
      abortRef.current?.abort();
      setIsStreaming(false);
    }
    try {
      const saved = localStorage.getItem(storageKey);
      setMessages(saved ? JSON.parse(saved) : []);
    } catch {
      setMessages([]);
    }
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [storageKey, item.id]);

  // Persist messages
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-30)));
    }
  }, [messages, storageKey]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Send message ─────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);
    setShowGuide(false);

    const config = getConfigForTask(aiSettings, 'creative');
    const controller = new AbortController();
    abortRef.current = controller;

    // Build item-aware context
    const itemContext = buildItemContext(item, productName, segment, competitorContext, projectContext, locale);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          projectContext: itemContext,
          locale,
          aiProvider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Chat failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'delta') {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + data.content };
                }
                return updated;
              });
            } else if (data.type === 'error') {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: friendlyError(data.error) };
                }
                return updated;
              });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = { ...last, content: friendlyError((err as Error).message) };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages, item, productName, segment, competitorContext, projectContext, locale]);

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(storageKey);
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Dynamic pills from active context, fallback to default
  const contextPills = activeContext
    ? activeContext.pills.map(p => ({ label: zh ? p.zh : p.en, prompt: p.prompt(item, zh) }))
    : (zh
      ? [
          { label: '生成变体方案', prompt: `请帮我为"${item.featureName}"生成 3-5 个 L2 Slogan 变体方案，覆盖不同类型（事实型/功能型/情感型），并给出评分和理由。` },
          { label: '帮我优化', prompt: `请帮我优化当前的 L2 Slogan "${item.l2Slogan}"，保留核心卖点但让表达更有感染力。给出 3 个优化方案。` },
          { label: '竞品话术分析', prompt: `请分析竞品在"${item.featureName}"这个维度上的营销话术，并建议我们如何差异化表达。` },
          { label: '合并包装建议', prompt: `请综合分析当前的 L1 名称、L2 Slogan 和 L3 子卖点，给出整体优化建议：三层之间是否逻辑连贯？有没有更好的组合方式？` },
        ]
      : [
          { label: 'Generate variants', prompt: `Generate 3-5 L2 Slogan variants for "${item.featureName}", covering different types (factual/functional/emotional), with scores and rationale.` },
          { label: 'Help refine', prompt: `Help refine the current L2 Slogan "${item.l2Slogan}" — keep the core but make it more impactful. Give 3 options.` },
          { label: 'Competitor analysis', prompt: `Analyze competitor messaging for "${item.featureName}" and suggest how we can differentiate.` },
          { label: 'Packaging review', prompt: `Review the overall L1/L2/L3 packaging coherence and suggest improvements for a tighter narrative.` },
        ]
    );

  const guideText = activeContext
    ? (zh ? activeContext.guide.zh : activeContext.guide.en)
    : (zh ? `关于「${item.featureName}」，有什么想聊的？` : `What would you like to explore about "${item.featureName}"?`);

  const contextLabel = activeContext ? (zh ? activeContext.label.zh : activeContext.label.en) : null;

  // ─── Render helpers ────────────────────────────────────────

  const renderVariantList = (variants: VariantSuggestion[]) => (
    <div className="rounded-lg border border-slate-100 bg-white divide-y divide-slate-100">
      {variants.slice(0, 3).map((variant, idx) => {
        // Tags: use AI-provided tags, or generate from sloganType + rationale
        const tags = variant.tags && variant.tags.length > 0 ? variant.tags : [];
        return (
        <div key={idx} className="px-3 py-2.5 hover:bg-slate-50/50 transition-colors">
          {/* Tags row */}
          {tags.length > 0 && (
            <div className="flex items-center gap-1 mb-1">
              {tags.slice(0, 3).map((tag, i) => (
                <span key={i} className="text-[9px] font-medium text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">{tag}</span>
              ))}
            </div>
          )}
          {/* Slogan + type badge + apply */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-900 flex-1">&ldquo;{variant.l2Slogan}&rdquo;</p>
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', sloganTypeColors[variant.l2SloganType])}>
                {sloganTypeLabels[variant.l2SloganType]?.[zh ? 'zh' : 'en']}
              </Badge>
              <Button
                size="sm"
                onClick={() => {
                  const updates: Partial<KspItem> = { l2Slogan: variant.l2Slogan, l2SloganType: variant.l2SloganType };
                  if (variant.l1Name) updates.l1Name = variant.l1Name;
                  onApply(item.id, updates);
                }}
                className="h-5 text-[9px] gap-0.5 bg-slate-800 hover:bg-slate-700 px-2"
              >
                <Check className="h-2.5 w-2.5" />
                {zh ? '应用' : 'Apply'}
              </Button>
            </div>
          </div>
          {/* Rationale + score */}
          <div className="flex items-center gap-2 mt-1">
            {variant.rationale && (
              <p className="text-[10px] text-slate-400 flex-1 truncate">{variant.rationale}</p>
            )}
            {variant.score !== undefined && (
              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0', scoreColor(variant.score))}>
                {variant.score}
              </span>
            )}
          </div>
        </div>
        ); })}
    </div>
  );

  // Collapsible AI reasoning state per message
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());

  const renderMessage = (msg: ChatMessage) => {
    if (msg.role === 'user') {
      return (
        <div key={msg.id} className="ml-auto max-w-[85%]">
          <div className="rounded-xl px-3 py-2 bg-slate-800 text-white">
            <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.content}</p>
          </div>
        </div>
      );
    }

    const content = msg.content || (isStreaming ? '...' : '');
    const parsed = parseMessageContent(content);
    const hasVariants = parsed.variants && parsed.variants.length > 0;
    const isThinkingExpanded = expandedThinking.has(msg.id);

    return (
      <div key={msg.id} className="mr-auto w-full space-y-1.5">
        {/* If has variants: text becomes collapsible "AI 思路" */}
        {hasVariants ? (
          <>
            {parsed.text && (
              <button
                onClick={() => setExpandedThinking(prev => {
                  const next = new Set(prev);
                  if (next.has(msg.id)) next.delete(msg.id); else next.add(msg.id);
                  return next;
                })}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              >
                {isThinkingExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {zh ? '查看 AI 思路' : 'View AI reasoning'}
              </button>
            )}
            {isThinkingExpanded && parsed.text && (
              <div className="rounded-lg px-3 py-2 bg-slate-50 text-slate-500 border border-slate-100">
                <p className="text-[11px] whitespace-pre-wrap leading-relaxed">{parsed.text}</p>
              </div>
            )}
            {/* Variant list — unified card */}
            {renderVariantList(parsed.variants!)}
          </>
        ) : (
          /* No variants — show text normally */
          parsed.text && (
            <div className="rounded-xl px-3 py-2 bg-white text-slate-900 border border-slate-100">
              <p className="text-xs whitespace-pre-wrap leading-relaxed">{parsed.text}</p>
            </div>
          )
        )}
      </div>
    );
  };

  // File input ref for attachment
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── JSX ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-100/60 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">{zh ? 'AI 助手' : 'AI Assistant'}</span>
          </div>
          <button onClick={clearHistory} className="text-slate-300 hover:text-slate-500 p-1 transition-colors" title={zh ? '清空对话' : 'Clear chat'}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {contextLabel && (
          <p className="text-[11px] text-blue-500 mt-1.5">
            {zh ? '正在讨论：' : 'Discussing: '}{contextLabel}
          </p>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {/* Messages first */}
        {messages.map(renderMessage)}

        {/* Guide + pills: at bottom, shown on empty state or when user clicks a new block */}
        {(messages.length === 0 || showGuide) && (
          <div className={cn(
            'flex flex-col items-center py-6',
            messages.length > 0 && 'pt-3 border-t border-slate-100 mt-2'
          )}>
            <p className="text-lg font-bold text-slate-900 text-center">
              {guideText}
            </p>
            <p className="text-xs text-slate-400 mt-1.5 text-center max-w-[14rem]">
              {zh ? '我了解这个卖点的完整上下文，可以帮你优化' : 'I have full context and can help optimize'}
            </p>

            {/* Context-aware pill buttons with colored icons */}
            <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-[20rem]">
              {contextPills.map((pill, idx) => {
                const icons = [
                  { Icon: Sparkles, color: 'text-amber-500' },
                  { Icon: Wand2, color: 'text-violet-500' },
                  { Icon: Swords, color: 'text-emerald-500' },
                  { Icon: Combine, color: 'text-blue-500' },
                ];
                const { Icon, color } = icons[idx % icons.length];
                return (
                  <button
                    key={idx}
                    onClick={() => sendMessage(pill.prompt)}
                    className="flex items-center gap-1.5 text-[11px] px-3.5 py-1.5 rounded-2xl bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all shadow-sm"
                    style={{ border: '0.5px solid #e2e8f0' }}
                  >
                    <Icon className={cn('h-3 w-3', color)} />
                    {pill.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 flex-shrink-0 space-y-2">
        {/* Collapsible model selector */}
        {showModelPicker && (
          <ModelSelector settings={aiSettings} onSettingsChange={setAiSettings} compact />
        )}

        {/* Input bar */}
        <div className="flex items-end gap-1 bg-white rounded-xl border border-slate-200 shadow-sm px-2 py-1.5 focus-within:border-slate-300 focus-within:shadow-md transition-all">
          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-slate-300 hover:text-slate-500 transition-colors p-1 self-end mb-0.5"
            title={zh ? '上传附件' : 'Upload attachment'}
          >
            <Plus className="h-4 w-4" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={() => { /* TODO: handle attachment */ }} />
          {/* Model picker toggle */}
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className={cn('transition-colors p-1 self-end mb-0.5', showModelPicker ? 'text-blue-500' : 'text-slate-300 hover:text-slate-500')}
            title={zh ? '切换 AI 模型' : 'Switch AI model'}
          >
            <Bot className="h-4 w-4" />
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={zh ? '输入你的想法...' : 'Share your thoughts...'}
            className="flex-1 text-sm px-1 py-1.5 resize-none focus:outline-none min-h-[80px] max-h-[160px] bg-transparent"
            rows={1}
          />
          {isStreaming ? (
            <button onClick={stopStreaming} className="text-slate-400 hover:text-slate-600 transition-colors p-1 self-end mb-0.5">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              className={cn(
                'p-1.5 rounded-lg self-end mb-0.5 transition-all',
                input.trim()
                  ? 'bg-slate-800 text-white hover:bg-slate-700'
                  : 'text-slate-300'
              )}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
