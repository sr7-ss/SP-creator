'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import TierColumn from './TierColumn';
import TierCard from './TierCard';
import { SpItem, SpTier } from '@/types';
import { useTranslation } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2, Plus, X, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadSettings, getAgentConfigForTask } from '@/lib/settings';

interface TierBoardProps {
  items: SpItem[];
  unrankedItems?: SpItem[];
  onItemsChange: (items: SpItem[]) => void;
  onUnrankedChange?: (items: SpItem[]) => void;
  onGenerateKsp?: () => void;
  isGenerating?: boolean;
  onDeleteItem?: (id: string) => void;
  projectId?: string; // needed for version save/load
  extraButtons?: React.ReactNode; // extra buttons to render in toolbar (right-aligned)
}

/** Horizontal pool for unranked parameters */
function UnrankedPool({ items }: { items: SpItem[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'tier-0' });
  const { locale } = useTranslation();

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border transition-all min-h-[60px]',
        isOver ? 'ring-2 ring-slate-400 border-slate-300' : 'border-border/60'
      )}
    >
      <div className="px-3 py-2 rounded-t-lg border-b bg-slate-50 border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-500">
            {locale === 'zh' ? '未分级参数' : 'Unranked Parameters'}
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-400">
            {items.length}
          </span>
        </div>
      </div>
      <div className="p-2 bg-slate-50/20">
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          {items.length === 0 ? (
            <div className="py-3 text-center text-[11px] text-slate-300">
              {locale === 'zh' ? '拖拽卖点到此处移除分级' : 'Drag items here to unrank'}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {items.map((item) => (
                <TierCard key={item.id} item={item} compact />
              ))}
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

/** Pool for soft selling points (tier=0) — dashed border, pending assignment */
function SoftSellingPointPool({ items, locale }: { items: SpItem[]; locale: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'tier-pending' });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border-2 border-dashed transition-all min-h-[60px] mt-3',
        isOver ? 'ring-2 ring-blue-300 border-blue-300 bg-blue-50/30' : 'border-slate-200'
      )}
    >
      <div className="px-3 py-2 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-400">
            {locale === 'zh' ? '💡 待分配的软卖点' : '💡 Soft Selling Points (Pending)'}
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-400">
            {items.length}
          </span>
        </div>
        <p className="text-[10px] text-slate-300 mt-0.5">
          {locale === 'zh'
            ? '这些卖点无法通过参数对比量化，需要你手动分配层级。拖拽到上方 T1/T2/T3 中。'
            : 'These cannot be quantified by specs comparison. Drag them into T1/T2/T3 above.'}
        </p>
      </div>
      <div className="p-2">
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap gap-1.5">
            {items.map((item) => (
              <TierCard key={item.id} item={item} compact />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export default function TierBoard({
  items,
  unrankedItems = [],
  onItemsChange,
  onUnrankedChange,
  onGenerateKsp,
  isGenerating,
  onDeleteItem,
  projectId,
  extraButtons,
}: TierBoardProps) {
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemValue, setNewItemValue] = useState('');
  const [newItemTier, setNewItemTier] = useState<SpTier>(3);

  // ─── AI Review state ──────────────────────────
  const [aiReview, setAiReview] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const handleAiReview = useCallback(async () => {
    const rankedItems = items.filter(i => i.tier >= 1 && i.tier <= 3);
    if (rankedItems.length === 0) return;
    setReviewLoading(true);
    setAiReview(null);
    try {
      const settings = loadSettings();
      const aiConfig = getAgentConfigForTask(settings, 'analysis' as never);
      const res = await fetch('/api/ai/sp-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spItems: rankedItems.map(i => ({ tier: i.tier, featureName: i.featureName, paramValue: i.paramValue })),
          productName: '', // will be filled by parent if needed
          locale: zh ? 'zh' : 'en',
          aiProvider: aiConfig?.provider,
          apiKey: aiConfig?.apiKey,
          model: aiConfig?.model,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiReview(data.review || null);
      } else {
        const data = await res.json().catch(() => ({}));
        setAiReview(data.error || (zh ? 'AI 评价失败' : 'AI review failed'));
      }
    } catch {
      setAiReview(zh ? '网络错误，请重试' : 'Network error, please retry');
    } finally {
      setReviewLoading(false);
    }
  }, [items, zh]);

  // Undo history — stores previous item states
  const [undoStack, setUndoStack] = useState<SpItem[][]>([]);

  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-9), [...items]]); // keep last 10
  }, [items]);

  // Wrap onDeleteItem to save undo state first
  const handleDelete = useCallback((id: string) => {
    pushUndo();
    onDeleteItem?.(id);
  }, [pushUndo, onDeleteItem]);

  // Add new item
  const handleAddItem = useCallback(() => {
    if (!newItemName.trim()) return;
    pushUndo();
    const newItem: SpItem = {
      id: `sp-manual-${Date.now()}`,
      tier: newItemTier,
      featureName: newItemName.trim(),
      paramValue: newItemValue.trim(),
      sortOrder: items.length,
    };
    onItemsChange([...items, newItem]);
    setNewItemName('');
    setNewItemValue('');
    setShowAddForm(false);
  }, [newItemName, newItemValue, newItemTier, items, pushUndo, onItemsChange]);

  // Rename a SP item
  const handleRename = useCallback((id: string, newName: string) => {
    onItemsChange(items.map(item =>
      item.id === id ? { ...item, featureName: newName } : item
    ));
  }, [items, onItemsChange]);

  // Update param value of a SP item
  const handleUpdateValue = useCallback((id: string, newValue: string) => {
    onItemsChange(items.map(item =>
      item.id === id ? { ...item, paramValue: newValue } : item
    ));
  }, [items, onItemsChange]);

  // Start merge flow
  const handleMergeStart = useCallback((id: string) => {
    if (mergeSourceId === id) {
      setMergeSourceId(null);
    } else if (mergeSourceId) {
      const source = items.find(i => i.id === mergeSourceId);
      const target = items.find(i => i.id === id);
      if (source && target) {
        pushUndo();
        const merged: SpItem = {
          ...target,
          featureName: `${target.featureName} + ${source.featureName}`,
          paramValue: [target.paramValue, source.paramValue].filter(Boolean).join(' / '),
        };
        onItemsChange(items.map(i => i.id === target.id ? merged : i).filter(i => i.id !== source.id));
      }
      setMergeSourceId(null);
    } else {
      setMergeSourceId(id);
    }
  }, [mergeSourceId, items, pushUndo, onItemsChange]);

  // Split a merged card
  const handleSplit = useCallback((id: string) => {
    const item = items.find(i => i.id === id);
    if (!item || !item.featureName.includes(' + ')) return;
    pushUndo();

    const names = item.featureName.split(' + ').map(s => s.trim());
    const values = item.paramValue.split(' / ').map(s => s.trim());

    const newItems: SpItem[] = names.map((name, idx) => ({
      ...item,
      id: idx === 0 ? item.id : `${item.id}-split-${idx}`,
      featureName: name,
      paramValue: values[idx] || '',
      sortOrder: item.sortOrder + idx,
    }));

    const result = items.flatMap(i => i.id === id ? newItems : [i]);
    onItemsChange(result);
  }, [items, pushUndo, onItemsChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const tier0Items = items.filter((i) => i.tier === 0); // soft selling points (unassigned)
  const tier1Items = items.filter((i) => i.tier === 1);
  const tier2Items = items.filter((i) => i.tier === 2);
  const tier3Items = items.filter((i) => i.tier === 3);

  const allItems = [...items, ...unrankedItems];
  const activeItem = activeId ? allItems.find((i) => i.id === activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const activeItemId = active.id as string;
      const overId = over.id as string;

      // Find item in ranked or unranked
      const fromRanked = items.find((i) => i.id === activeItemId);
      const fromUnranked = unrankedItems.find((i) => i.id === activeItemId);
      const draggedItem = fromRanked || fromUnranked;
      if (!draggedItem) return;

      const isFromUnranked = !!fromUnranked;

      // Determine target tier (0 = unranked)
      let targetTier: 0 | SpTier;
      if (overId === 'tier-0' || unrankedItems.some((i) => i.id === overId)) {
        targetTier = 0;
      } else if (overId === 'tier-pending' || tier0Items.some((i) => i.id === overId)) {
        targetTier = 0;
      } else if (overId === 'tier-1' || tier1Items.some((i) => i.id === overId)) {
        targetTier = 1;
      } else if (overId === 'tier-2' || tier2Items.some((i) => i.id === overId)) {
        targetTier = 2;
      } else if (overId === 'tier-3' || tier3Items.some((i) => i.id === overId)) {
        targetTier = 3;
      } else {
        targetTier = 3; // default
      }

      // Case: dragging to unranked pool
      if (targetTier === 0) {
        if (isFromUnranked) return; // already unranked, no-op
        // Remove from ranked, add to unranked
        const newRanked = items.filter((i) => i.id !== activeItemId);
        const movedToUnranked: SpItem = { ...draggedItem, tier: 1, sortOrder: 0 }; // tier doesn't matter for unranked
        onItemsChange(reindex(newRanked));
        onUnrankedChange?.([...unrankedItems, movedToUnranked]);
        return;
      }

      // Case: dragging from unranked to a tier
      if (isFromUnranked) {
        const newUnranked = unrankedItems.filter((i) => i.id !== activeItemId);
        const movedItem: SpItem = { ...draggedItem, tier: targetTier as SpTier, sortOrder: 0 };

        // Insert into target tier
        const tierItems = items.filter((i) => i.tier === targetTier);
        const at = tierItems.findIndex((i) => i.id === overId);
        const idx = at === -1 ? tierItems.length : at;
        const otherItems = items.filter((i) => i.tier !== targetTier);
        const newTierItems = [...tierItems];
        newTierItems.splice(idx, 0, movedItem);

        onItemsChange(reindex([...otherItems, ...newTierItems]));
        onUnrankedChange?.(newUnranked);
        return;
      }

      // Case: reorder within ranked tiers (including tier 0 soft selling points)
      const fromTier = draggedItem.tier;
      const movedItem: SpItem = { ...draggedItem, tier: targetTier as SpTier };

      const t0 = items.filter((i) => i.tier === 0);
      const t1 = items.filter((i) => i.tier === 1);
      const t2 = items.filter((i) => i.tier === 2);
      const t3 = items.filter((i) => i.tier === 3);

      const tierMap: Record<number, SpItem[]> = { 0: t0, 1: t1, 2: t2, 3: t3 };

      const withoutActive = (list: SpItem[]) => list.filter((i) => i.id !== activeItemId);
      const insertAt = (list: SpItem[], overId: string) => {
        const idx = list.findIndex((i) => i.id === overId);
        return idx === -1 ? list.length : idx;
      };

      const nextTiers: Record<number, SpItem[]> = { 0: t0, 1: t1, 2: t2, 3: t3 };

      if (fromTier === targetTier) {
        const current = tierMap[targetTier] || [];
        const currentWithout = withoutActive(current);
        const at = insertAt(currentWithout, overId);
        const nextTarget = [...currentWithout];
        nextTarget.splice(at, 0, movedItem);
        nextTiers[targetTier] = nextTarget;
      } else {
        const fromList = tierMap[fromTier] || [];
        const toList = tierMap[targetTier] || [];

        nextTiers[fromTier] = withoutActive(fromList);
        const nextTo = [...toList];
        const at = insertAt(toList, overId);
        nextTo.splice(at, 0, movedItem);
        nextTiers[targetTier] = nextTo;
      }

      onItemsChange(reindex([...nextTiers[0], ...nextTiers[1], ...nextTiers[2], ...nextTiers[3]]));
    },
    [items, unrankedItems, tier0Items, tier1Items, tier2Items, tier3Items, onItemsChange, onUnrankedChange]
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {/* Add item */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
          className="gap-1.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          {locale === 'zh' ? '添加卖点' : 'Add Item'}
        </Button>

        {onGenerateKsp && (
          <Button
            onClick={onGenerateKsp}
            disabled={isGenerating}
            className="gap-2 bg-slate-800 hover:bg-slate-900"
            size="sm"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isGenerating ? t('ksp.generating') : t('ksp.generate')}
          </Button>
        )}

        {/* AI Review */}
        {items.filter(i => i.tier >= 1).length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAiReview}
            disabled={reviewLoading}
            className="gap-1.5 text-xs"
          >
            {reviewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
            {zh ? 'AI 评价' : 'AI Review'}
          </Button>
        )}

        {mergeSourceId && (
          <p className="text-xs text-slate-400">
            {zh ? '🔗 点击另一个卖点完成合并，或再次点击取消' : '🔗 Click another to merge, or click again to cancel'}
          </p>
        )}

        {/* Extra buttons (export, version management) — right-aligned */}
        {extraButtons && (
          <div className="ml-auto flex items-center gap-2">
            {extraButtons}
          </div>
        )}
      </div>

      {/* Add item form */}
      {showAddForm && (
        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <Input
            value={newItemName}
            onChange={e => setNewItemName(e.target.value)}
            placeholder={locale === 'zh' ? '卖点名称' : 'Feature name'}
            className="h-8 text-xs flex-1"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
          />
          <Input
            value={newItemValue}
            onChange={e => setNewItemValue(e.target.value)}
            placeholder={locale === 'zh' ? '参数值（可选）' : 'Value (optional)'}
            className="h-8 text-xs flex-1"
            onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
          />
          <select
            value={newItemTier}
            onChange={e => setNewItemTier(Number(e.target.value) as SpTier)}
            className="h-8 text-xs border border-slate-200 rounded-md px-2 bg-white"
          >
            <option value={1}>T1</option>
            <option value={2}>T2</option>
            <option value={3}>T3</option>
          </select>
          <Button size="sm" onClick={handleAddItem} disabled={!newItemName.trim()} className="h-8 text-xs bg-slate-800">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={(args) => {
          // Use pointerWithin first (most intuitive for cross-tier dragging)
          const pointerCollisions = pointerWithin(args);
          if (pointerCollisions.length > 0) return pointerCollisions;
          // Fall back to rect intersection
          return rectIntersection(args);
        }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col gap-2">
          <TierColumn
            tier={1}
            title={t('ksp.tier1')}
            items={tier1Items}
            color="red"
            onDeleteItem={handleDelete}
            onRenameItem={handleRename}
            onUpdateValue={handleUpdateValue}
            onMergeStart={handleMergeStart}
            onSplitItem={handleSplit}
            mergeSourceId={mergeSourceId}
          />
          <TierColumn
            tier={2}
            title={t('ksp.tier2')}
            items={tier2Items}
            color="amber"
            onDeleteItem={handleDelete}
            onRenameItem={handleRename}
            onUpdateValue={handleUpdateValue}
            onMergeStart={handleMergeStart}
            onSplitItem={handleSplit}
            mergeSourceId={mergeSourceId}
          />
          <TierColumn
            tier={3}
            title={t('ksp.tier3')}
            items={tier3Items}
            color="slate"
            onDeleteItem={handleDelete}
            onRenameItem={handleRename}
            onUpdateValue={handleUpdateValue}
            onMergeStart={handleMergeStart}
            onSplitItem={handleSplit}
            mergeSourceId={mergeSourceId}
          />
        </div>

        {/* Soft selling points — tier 0 (pending assignment) */}
        {tier0Items.length > 0 && (
          <SoftSellingPointPool items={tier0Items} locale={locale} />
        )}

        {/* Unranked pool */}
        {(unrankedItems.length > 0 || items.length > 0) && (
          <UnrankedPool items={unrankedItems} />
        )}

        <DragOverlay>
          {activeItem ? <TierCard item={activeItem} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* AI Review result */}
      {(aiReview || reviewLoading) && (
        <div className="mt-4 border border-blue-200 rounded-xl bg-blue-50/30 overflow-hidden">
          <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs font-semibold text-slate-700">{zh ? 'AI 评价' : 'AI Review'}</span>
            </div>
            {aiReview && (
              <button onClick={() => setAiReview(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="px-4 py-3">
            {reviewLoading ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <span className="text-xs text-slate-500">{zh ? 'AI 正在评估你的方案...' : 'AI is evaluating your arrangement...'}</span>
              </div>
            ) : (
              <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {aiReview}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Re-assign sortOrder sequentially within each tier */
function reindex(items: SpItem[]): SpItem[] {
  const counters: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  return items.map((item) => {
    const tier = item.tier;
    const sortOrder = counters[tier] ?? 0;
    counters[tier] = sortOrder + 1;
    return { ...item, sortOrder };
  });
}
