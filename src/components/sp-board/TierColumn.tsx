'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import TierCard from './TierCard';
import { SpItem, SpTier } from '@/types';
import { useTranslation } from '@/lib/store';
import { cn } from '@/lib/utils';

interface TierColumnProps {
  tier: SpTier;
  title: string;
  items: SpItem[];
  color: 'red' | 'amber' | 'slate';
  onDeleteItem?: (id: string) => void;
  onRenameItem?: (id: string, newName: string) => void;
  onUpdateValue?: (id: string, newValue: string) => void;
  onMergeStart?: (id: string) => void;
  onSplitItem?: (id: string) => void;
  mergeSourceId?: string | null;
}

const colorMap = {
  red: {
    header: 'bg-red-50 border-red-200 text-red-700',
    body: 'bg-red-50/30',
    badge: 'bg-red-100 text-red-600',
  },
  amber: {
    header: 'bg-amber-50 border-amber-200 text-amber-700',
    body: 'bg-amber-50/30',
    badge: 'bg-amber-100 text-amber-600',
  },
  slate: {
    header: 'bg-slate-50 border-slate-200 text-slate-600',
    body: 'bg-slate-50/30',
    badge: 'bg-slate-100 text-slate-500',
  },
};

export default function TierColumn({ tier, title, items, color, onDeleteItem, onRenameItem, onUpdateValue, onMergeStart, onSplitItem, mergeSourceId }: TierColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `tier-${tier}` });
  const { locale } = useTranslation();
  const colors = colorMap[color];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border transition-all min-h-[70px]',
        isOver ? 'ring-2 ring-slate-400 border-slate-300' : 'border-border/60'
      )}
    >
      <div className="flex">
        {/* Tier label — vertical strip on the left */}
        <div className={cn('px-3 py-3 rounded-l-lg border-r flex flex-col items-center justify-center min-w-[90px]', colors.header)}>
          <h3 className="text-xs font-semibold">{title}</h3>
          <span className={cn('text-[10px] mt-1 px-1.5 py-0.5 rounded-full font-medium', colors.badge)}>
            {items.length}
          </span>
        </div>

        {/* Cards — horizontal */}
        <div className={cn('flex-1 p-2', colors.body)}>
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={horizontalListSortingStrategy}
          >
            {items.length === 0 ? (
              <div className="py-3 text-center text-xs text-slate-300 w-full">
                {locale === 'zh' ? '拖拽卖点到此处' : 'Drop items here'}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                {items.map((item) => (
                  <TierCard
                    key={item.id}
                    item={item}
                    onDelete={onDeleteItem}
                    onRename={onRenameItem}
                    onUpdateValue={onUpdateValue}
                    onMergeStart={mergeSourceId ? (id) => onMergeStart?.(id) : onMergeStart}
                    onSplit={onSplitItem}
                    isMergeSource={mergeSourceId === item.id}
                    isMergeTarget={!!mergeSourceId && mergeSourceId !== item.id}
                  />
                ))}
              </div>
            )}
          </SortableContext>
        </div>
      </div>
    </div>
  );
}
