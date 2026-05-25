'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, History, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KspItem, SloganType, L3SubPoint, PackagingVersion } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ItemChatPanel from './ItemChatPanel';

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

const techniqueLabels: Record<string, { zh: string; en: string }> = {
  concrete: { zh: '具象化', en: 'Concrete' },
  equivalent: { zh: '等价换算', en: 'Equivalent' },
  extreme: { zh: '极限表达', en: 'Extreme' },
};

const tierColors: Record<number, { border: string; bg: string; text: string }> = {
  1: { border: 'border-red-400', bg: 'bg-red-50', text: 'text-red-600' },
  2: { border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-600' },
  3: { border: 'border-slate-300', bg: 'bg-slate-50', text: 'text-slate-500' },
};

const tierLabels: Record<number, { zh: string; en: string }> = {
  1: { zh: 'T1 核心卖点', en: 'T1 Core' },
  2: { zh: 'T2 重要卖点', en: 'T2 Important' },
  3: { zh: 'T3 基础卖点', en: 'T3 Basic' },
};

const MIN_LEFT_WIDTH = 300;
const MAX_LEFT_RATIO = 0.8;
const MIN_RIGHT_WIDTH = 250;

// ─── Block context config ────────────────────────────────────

export type BlockType = 'l1' | 'l2' | 'alt' | 'l3';

export interface BlockContext {
  id: string;
  type: BlockType;
  label: { zh: string; en: string };
  guide: { zh: string; en: string };
  pills: { zh: string; en: string; prompt: (item: KspItem, zh: boolean) => string }[];
  /** Index for alt/l3 blocks */
  index?: number;
}

function getBlockContexts(item: KspItem): BlockContext[] {
  const contexts: BlockContext[] = [
    {
      id: 'l1',
      type: 'l1',
      label: { zh: '卖点名称', en: 'Feature Name' },
      guide: { zh: '这个命名你满意吗？', en: 'Happy with this name?' },
      pills: [
        { zh: '换个命名风格', en: 'Different naming style', prompt: (it, z) => z ? `请帮我给"${it.featureName}"换一个 L1 卖点命名风格，当前是"${it.l1Name}"，给 3 个不同方向的方案。` : `Give me 3 alternative L1 naming styles for "${it.featureName}", current is "${it.l1Name}".` },
        { zh: '更简短有力', en: 'Shorter & punchier', prompt: (it, z) => z ? `当前 L1 名称是"${it.l1Name}"，帮我缩短到更简洁有力的版本，给 3 个方案。` : `Current L1 name "${it.l1Name}" — make it shorter and punchier. Give 3 options.` },
        { zh: '更有记忆点', en: 'More memorable', prompt: (it, z) => z ? `当前 L1 名称"${it.l1Name}"不够有记忆点，帮我想几个更容易被记住的命名。` : `Make "${it.l1Name}" more memorable. Give 3 options.` },
        { zh: '参考竞品命名', en: 'Competitor reference', prompt: (it, z) => z ? `分析竞品在"${it.featureName}"这个维度的 L1 命名方式，然后给出差异化的命名建议。` : `Analyze how competitors name "${it.featureName}" and suggest differentiated alternatives.` },
      ],
    },
    {
      id: 'l2',
      type: 'l2',
      label: { zh: '主 Slogan', en: 'Main Slogan' },
      guide: { zh: '这句 slogan 想怎么调？', en: 'How should we adjust this slogan?' },
      pills: [
        { zh: '换个方向', en: 'Different angle', prompt: (it, z) => z ? `当前 L2 Slogan 是"${it.l2Slogan}"(${it.l2SloganType})，换一个完全不同的创意方向，给 3 个变体方案并评分。` : `Current slogan "${it.l2Slogan}" (${it.l2SloganType}) — try a completely different angle. Give 3 scored variants.` },
        { zh: '更感性一点', en: 'More emotional', prompt: (it, z) => z ? `把"${it.l2Slogan}"改成更有情感共鸣的表达，偏情绪价值型，给 3 个方案。` : `Make "${it.l2Slogan}" more emotionally resonant. Give 3 options.` },
        { zh: '更直接有力', en: 'More direct', prompt: (it, z) => z ? `"${it.l2Slogan}"太含蓄了，帮我改成更直接、更有冲击力的表达。` : `"${it.l2Slogan}" is too subtle — make it more direct and impactful.` },
        { zh: '看竞品怎么写', en: 'Competitor copy', prompt: (it, z) => z ? `分析竞品在"${it.featureName}"上的 Slogan 写法，然后给出差异化建议。` : `Analyze competitor slogans for "${it.featureName}" and suggest differentiated versions.` },
      ],
    },
  ];

  // Alt blocks
  if (item.l2Alternatives) {
    item.l2Alternatives.forEach((_, idx) => {
      contexts.push({
        id: `alt-${idx}`,
        type: 'alt',
        index: idx,
        label: { zh: `备选方案 ${idx + 1}`, en: `Alternative ${idx + 1}` },
        guide: { zh: '要用这句替换主 Slogan 吗？', en: 'Want to swap this in as the main slogan?' },
        pills: [
          { zh: '微调措辞', en: 'Tweak wording', prompt: (it, z) => z ? `帮我微调这句备选 Slogan："${it.l2Alternatives?.[idx]?.text}"，保留核心但优化措辞。` : `Tweak the wording of "${it.l2Alternatives?.[idx]?.text}" — keep the core but refine.` },
          { zh: '换个角度', en: 'Different angle', prompt: (it, z) => z ? `"${it.l2Alternatives?.[idx]?.text}"这句换一个角度重写，给 3 个方案。` : `Rewrite "${it.l2Alternatives?.[idx]?.text}" from a different angle. 3 options.` },
          { zh: '生成更多变体', en: 'More variants', prompt: (it, z) => z ? `基于"${it.l2Alternatives?.[idx]?.text}"的方向，再生成 3 个类似风格的变体。` : `Generate 3 more variants in the style of "${it.l2Alternatives?.[idx]?.text}".` },
          { zh: '对比分析', en: 'Compare', prompt: (it, z) => z ? `对比分析主 Slogan "${it.l2Slogan}" 和备选"${it.l2Alternatives?.[idx]?.text}"，哪个更好？为什么？` : `Compare main "${it.l2Slogan}" vs alt "${it.l2Alternatives?.[idx]?.text}" — which is better and why?` },
        ],
      });
    });
  }

  // L3 blocks
  if (item.l3Details) {
    item.l3Details.forEach((sub, idx) => {
      contexts.push({
        id: `l3-${idx}`,
        type: 'l3',
        index: idx,
        label: { zh: `子卖点: ${sub.name}`, en: `Sub-point: ${sub.name}` },
        guide: { zh: '这个子卖点的描述够具象吗？', en: 'Is this sub-point description concrete enough?' },
        pills: [
          { zh: '加具象化数据', en: 'Add concrete data', prompt: (_, z) => z ? `"${sub.name}: ${sub.description}" 这个描述不够具象，帮我加入具体的数字或场景。` : `"${sub.name}: ${sub.description}" — add concrete numbers or scenarios.` },
          { zh: '换个包装手法', en: 'Different technique', prompt: (_, z) => z ? `"${sub.name}: ${sub.description}" 当前手法是${sub.technique}，换一种包装手法重写。` : `Rewrite "${sub.name}: ${sub.description}" using a different packaging technique (current: ${sub.technique}).` },
          { zh: '更有冲击力', en: 'More impactful', prompt: (_, z) => z ? `让"${sub.name}: ${sub.description}"更有冲击力，更能打动用户。` : `Make "${sub.name}: ${sub.description}" more impactful.` },
          { zh: '等价换算', en: 'Equivalent conversion', prompt: (_, z) => z ? `用等价换算的手法重新包装"${sub.name}: ${sub.description}"，把参数翻译成用户能感知的场景。` : `Repackage "${sub.name}: ${sub.description}" using equivalent conversion — translate specs into user-perceivable scenarios.` },
        ],
      });
    });
  }

  return contexts;
}

// ─── Props ───────────────────────────────────────────────────

interface PackagingDetailViewProps {
  item: KspItem;
  allItems: KspItem[];
  onBack: () => void;
  onItemUpdate: (itemId: string, updates: Partial<KspItem>) => void;
  onNavigate: (item: KspItem) => void;
  productName: string;
  segment?: string;
  competitorContext?: string;
  projectId: string;
  projectContext: string;
  locale: string;
}

// ─── Click-to-edit field ─────────────────────────────────────

function EditableText({
  value, onSave, className, inputClassName, placeholder, multiline,
}: {
  value: string; onSave: (v: string) => void; className?: string; inputClassName?: string; placeholder?: string; multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.selectionStart = 0; inputRef.current.selectionEnd = draft.length; } }, [editing]);

  const commit = () => { const t = draft.trim(); if (t && t !== value) onSave(t); else setDraft(value); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (editing) {
    const Tag = multiline ? 'textarea' : 'input';
    return <Tag ref={inputRef as React.RefObject<HTMLInputElement & HTMLTextAreaElement>} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); } if (e.key === 'Escape') cancel(); }} className={cn('w-full bg-white border border-blue-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all', inputClassName)} rows={multiline ? 2 : undefined} placeholder={placeholder} />;
  }

  return (
    <span onClick={e => { e.stopPropagation(); setEditing(true); }} className={cn('cursor-text', className)}>
      {value || <span className="text-slate-300 italic">{placeholder}</span>}
    </span>
  );
}

// ─── Clickable content block ─────────────────────────────────

function ContentBlock({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-lg px-4 py-3 cursor-pointer transition-all border-l-[3px]',
        active
          ? 'border-l-blue-500 bg-blue-50/60'
          : 'border-l-transparent hover:bg-slate-100/60',
        className
      )}
    >
      {children}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────

export default function PackagingDetailView({
  item, allItems, onBack, onItemUpdate, onNavigate, productName, segment, competitorContext, projectId, projectContext, locale,
}: PackagingDetailViewProps) {
  const zh = locale === 'zh';
  const [showVersions, setShowVersions] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [headerPadding, setHeaderPadding] = useState(() => {
    try { const v = localStorage.getItem('pkg_header_pad'); return v ? Number(v) : 10; } catch { return 10; }
  });
  const isHeaderDragging = useRef(false);
  const headerDragStartY = useRef(0);
  const headerDragStartPad = useRef(10);

  // Build block contexts from item
  const blockContexts = getBlockContexts(item);
  const activeContext = blockContexts.find(b => b.id === activeBlockId) || null;

  // ─── Draggable split ──────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(() => {
    try { const v = localStorage.getItem('pkg_left_width'); return v ? Number(v) : null; } catch { return null; }
  });
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const onHeaderDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isHeaderDragging.current = true;
    headerDragStartY.current = e.clientY;
    headerDragStartPad.current = headerPadding;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [headerPadding]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isHeaderDragging.current) return;
      const delta = e.clientY - headerDragStartY.current;
      setHeaderPadding(Math.max(4, Math.min(60, headerDragStartPad.current + delta)));
    };
    const onUp = () => {
      if (!isHeaderDragging.current) return;
      isHeaderDragging.current = false;
      try { localStorage.setItem('pkg_header_pad', String(headerPadding)); } catch {}
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); isDragging.current = true; dragStartX.current = e.clientX;
    dragStartWidth.current = leftWidth ?? (containerRef.current?.clientWidth ?? 900) * 0.66;
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
  }, [leftWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const cw = containerRef.current.clientWidth; const d = e.clientX - dragStartX.current;
      const nw = Math.min(cw * MAX_LEFT_RATIO, Math.max(MIN_LEFT_WIDTH, dragStartWidth.current + d));
      if (cw - nw >= MIN_RIGHT_WIDTH) setLeftWidth(nw);
    };
    const onMouseUp = () => { if (!isDragging.current) return; isDragging.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; try { if (leftWidth) localStorage.setItem('pkg_left_width', String(leftWidth)); } catch {} };
    document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp);
    return () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
  }, []);

  const currentIndex = allItems.findIndex(i => i.id === item.id);
  const prevItem = currentIndex > 0 ? allItems[currentIndex - 1] : null;
  const nextItem = currentIndex < allItems.length - 1 ? allItems[currentIndex + 1] : null;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return; if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onBack]);

  const tc = tierColors[item.tier] || tierColors[3];
  const versions = item.packagingVersions || [];

  const handleSwapAlternative = useCallback((altIdx: number) => {
    if (!item.l2Alternatives?.[altIdx]) return;
    const alt = item.l2Alternatives[altIdx];
    const newAlts = [...item.l2Alternatives];
    newAlts[altIdx] = { text: item.l2Slogan || '', type: item.l2SloganType || 'functional' };
    onItemUpdate(item.id, { l2Slogan: alt.text, l2SloganType: alt.type as SloganType, l2Alternatives: newAlts });
    toast.success(zh ? 'Slogan 已替换' : 'Slogan swapped');
  }, [item, onItemUpdate, zh]);

  const cycleSloganType = useCallback(() => {
    const types: SloganType[] = ['factual', 'functional', 'emotional'];
    const idx = types.indexOf(item.l2SloganType || 'functional');
    onItemUpdate(item.id, { l2SloganType: types[(idx + 1) % types.length] });
  }, [item, onItemUpdate]);

  const handleApply = useCallback((itemId: string, updates: Partial<KspItem>) => {
    onItemUpdate(itemId, updates); toast.success(zh ? '已应用' : 'Applied');
  }, [onItemUpdate, zh]);

  const leftStyle = leftWidth ? { width: leftWidth, flexShrink: 0 } : { flex: '2 1 0%' };
  const rightStyle = leftWidth ? { flex: '1 1 0%' } : { flex: '1 1 0%' };

  return (
    <div className="flex flex-col h-full">
      {/* ─── Top bar ─── */}
      <div className="flex items-center justify-between px-5 border-b border-slate-100 flex-shrink-0" style={{ paddingTop: headerPadding, paddingBottom: headerPadding }}>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {nextItem && <span>{zh ? '下一个卖点' : 'Next'}: <span className="text-slate-600 font-medium">{nextItem.featureName}</span></span>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" disabled={!prevItem} onClick={() => prevItem && onNavigate(prevItem)} className="h-7 w-7"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs text-slate-400 min-w-[3rem] text-center tabular-nums">{currentIndex + 1} / {allItems.length}</span>
          <Button variant="ghost" size="icon" disabled={!nextItem} onClick={() => nextItem && onNavigate(nextItem)} className="h-7 w-7"><ChevronRight className="h-4 w-4" /></Button>
          <div className="h-5 w-px bg-slate-200 mx-1" />
          <Button variant="ghost" size="icon" onClick={onBack} className="h-7 w-7 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Top bar / content divider — drag to resize header height */}
      <div
        onMouseDown={onHeaderDragStart}
        className="h-1.5 cursor-ns-resize flex-shrink-0 z-10"
      />

      {/* ─── Main split ─── */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel */}
        <div className="overflow-y-auto overflow-x-hidden px-6 py-6" style={{ ...leftStyle, backgroundColor: '#F5F5F5' }}>
          <div className="space-y-4">
            {/* L1 */}
            <ContentBlock active={activeBlockId === 'l1'} onClick={() => setActiveBlockId(activeBlockId === 'l1' ? null : 'l1')}>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">L1 {zh ? '卖点名称' : 'Feature Name'}</label>
                <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', tc.text, tc.bg)}>
                  {tierLabels[item.tier]?.[zh ? 'zh' : 'en'] || `T${item.tier}`}
                </Badge>
              </div>
              <EditableText value={item.l1Name || ''} onSave={v => onItemUpdate(item.id, { l1Name: v })} className="text-2xl font-bold text-slate-900 block" inputClassName="text-2xl font-bold" placeholder={zh ? '点击输入卖点名称...' : 'Click to add...'} />
            </ContentBlock>

            {/* L2 */}
            <ContentBlock active={activeBlockId === 'l2'} onClick={() => setActiveBlockId(activeBlockId === 'l2' ? null : 'l2')}>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">L2 Slogan</label>
                <button onClick={e => { e.stopPropagation(); cycleSloganType(); }} className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer', sloganTypeColors[item.l2SloganType || 'functional'])}>
                  {sloganTypeLabels[item.l2SloganType || 'functional']?.[zh ? 'zh' : 'en']}
                </button>
              </div>
              <EditableText value={item.l2Slogan || ''} onSave={v => onItemUpdate(item.id, { l2Slogan: v })} className="text-xl text-slate-700 italic block" inputClassName="text-xl italic" placeholder={zh ? '点击输入 Slogan...' : 'Click to add...'} />
            </ContentBlock>

            {/* L2 Alternatives */}
            {item.l2Alternatives && item.l2Alternatives.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-4">{zh ? '备选方案' : 'Alternatives'}</label>
                {item.l2Alternatives.map((alt, idx) => (
                  <ContentBlock key={idx} active={activeBlockId === `alt-${idx}`} onClick={() => setActiveBlockId(activeBlockId === `alt-${idx}` ? null : `alt-${idx}`)}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600 italic flex-1">&ldquo;{alt.text}&rdquo;</span>
                      <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', sloganTypeColors[alt.type as SloganType] || sloganTypeColors.functional)}>
                        {sloganTypeLabels[alt.type as SloganType]?.[zh ? 'zh' : 'en'] || alt.type}
                      </Badge>
                      <button onClick={e => { e.stopPropagation(); handleSwapAlternative(idx); }} className="text-[10px] text-slate-300 hover:text-blue-500 transition-colors">{zh ? '替换' : 'use'}</button>
                    </div>
                  </ContentBlock>
                ))}
              </div>
            )}

            {/* L3 Sub-points */}
            {item.l3Details && item.l3Details.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-4">L3 {zh ? '子卖点' : 'Sub-points'}</label>
                {item.l3Details.map((sub: L3SubPoint, idx: number) => (
                  <ContentBlock key={idx} active={activeBlockId === `l3-${idx}`} onClick={() => setActiveBlockId(activeBlockId === `l3-${idx}` ? null : `l3-${idx}`)}>
                    <div className="flex items-center justify-between mb-1">
                      <EditableText value={sub.name} onSave={v => { const d = [...(item.l3Details || [])]; d[idx] = { ...d[idx], name: v }; onItemUpdate(item.id, { l3Details: d }); }} className="text-base font-semibold text-slate-800" inputClassName="text-base font-semibold" placeholder={zh ? '子卖点名称' : 'Sub-point name'} />
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-slate-400">
                        {zh ? techniqueLabels[sub.technique]?.zh : techniqueLabels[sub.technique]?.en}
                      </Badge>
                    </div>
                    <EditableText value={sub.description} onSave={v => { const d = [...(item.l3Details || [])]; d[idx] = { ...d[idx], description: v }; onItemUpdate(item.id, { l3Details: d }); }} className="text-sm text-slate-600 block" inputClassName="text-sm" placeholder={zh ? '描述...' : 'Description...'} multiline />
                  </ContentBlock>
                ))}
              </div>
            )}

            {/* Version History */}
            {versions.length > 0 && (
              <section className="pt-4 border-t border-slate-200/60 px-4">
                <button onClick={() => setShowVersions(!showVersions)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors">
                  <History className="h-3.5 w-3.5" />
                  {zh ? `${versions.length} 个历史版本` : `${versions.length} version(s)`}
                  {showVersions ? <ChevronLeft className="h-3 w-3 rotate-90" /> : <ChevronRight className="h-3 w-3 rotate-90" />}
                </button>
                {showVersions && (
                  <div className="mt-3 space-y-2">
                    {versions.map((v: PackagingVersion, idx: number) => {
                      const isCurrent = v.l2Slogan === item.l2Slogan;
                      return (
                        <div key={idx} className={cn('rounded-lg border p-3 transition-all', isCurrent ? 'border-green-200 bg-green-50/30' : 'border-slate-100 bg-white hover:border-slate-200')}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[9px] font-semibold">V{v.version}</Badge>
                              {isCurrent && <span className="text-[9px] text-green-600">{zh ? '当前' : 'Current'}</span>}
                            </div>
                            {!isCurrent && (
                              <Button size="sm" variant="ghost" onClick={() => { onItemUpdate(item.id, { l1Name: v.l1Name, l2Slogan: v.l2Slogan, l2SloganType: v.l2SloganType, l2Alternatives: v.l2Alternatives, l3Details: v.l3Details }); toast.success(zh ? `已恢复到 V${v.version}` : `Restored V${v.version}`); }} className="h-6 text-[10px] gap-1">
                                <Check className="h-3 w-3" /> {zh ? '恢复' : 'Restore'}
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 italic">&ldquo;{v.l2Slogan}&rdquo;</p>
                          {v.refinementPrompt && <p className="text-[10px] text-slate-400 mt-1">{v.refinementPrompt}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        {/* Draggable divider */}
        {/* Draggable divider — invisible, just the grab area */}
        <div onMouseDown={onDragStart} className="w-2 cursor-col-resize flex-shrink-0 z-10" />

        {/* Right panel — AI chatbot */}
        <div className="min-h-0 min-w-0 bg-white border-l border-slate-200 overflow-hidden" style={rightStyle}>
          <ItemChatPanel
            item={item}
            productName={productName}
            segment={segment}
            competitorContext={competitorContext}
            projectContext={projectContext}
            projectId={projectId}
            onApply={handleApply}
            locale={locale}
            activeContext={activeContext}
          />
        </div>
      </div>
    </div>
  );
}
