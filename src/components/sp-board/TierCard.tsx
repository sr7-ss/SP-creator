'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Merge, Check, Split, Info, TrendingUp } from 'lucide-react';
import { SpItem } from '@/types';
import { useTranslation } from '@/lib/store';
import { cn } from '@/lib/utils';

/** Map raw param keys to readable display names */
const FEATURE_DISPLAY_NAMES: Record<string, { zh: string; en: string }> = {
  'battery.charging': { zh: '充电', en: 'Charging' },
  'battery.type': { zh: '电池', en: 'Battery' },
  'display.type': { zh: '屏幕', en: 'Display' },
  'display.size': { zh: '屏幕尺寸', en: 'Screen Size' },
  'display.resolution': { zh: '分辨率', en: 'Resolution' },
  'platform.chipset': { zh: '芯片', en: 'Chipset' },
  'platform.cpu': { zh: 'CPU', en: 'CPU' },
  'camera.specs': { zh: '后置摄像头', en: 'Rear Camera' },
  'selfie.specs': { zh: '前置摄像头', en: 'Front Camera' },
  'camera.video': { zh: '视频录制', en: 'Video' },
  'memory.internal': { zh: '内存/存储', en: 'Memory' },
  'body.weight': { zh: '重量', en: 'Weight' },
  'body.dimensions': { zh: '尺寸', en: 'Dimensions' },
  'body.build': { zh: '机身材质', en: 'Build Material' },
  'body.protection': { zh: '防护', en: 'Protection' },
  'misc.price': { zh: '价格', en: 'Price' },
  'misc.colors': { zh: '配色', en: 'Colors' },
  'misc.nfc': { zh: 'NFC', en: 'NFC' },
};

function getDisplayName(featureName: string, locale: string): string {
  // If it's a known param key, translate
  const mapped = FEATURE_DISPLAY_NAMES[featureName];
  if (mapped) return locale === 'zh' ? mapped.zh : mapped.en;

  // If it contains a dot (like "battery.charging"), format the last part
  if (featureName.includes('.')) {
    const parts = featureName.split('.');
    const lastPart = parts[parts.length - 1];
    // Try the full key first, then just match the full key
    const fullKey = featureName.toLowerCase();
    const mapped2 = FEATURE_DISPLAY_NAMES[fullKey];
    if (mapped2) return locale === 'zh' ? mapped2.zh : mapped2.en;
    // Capitalize the last part as fallback
    return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
  }

  return featureName;
}

interface TierCardProps {
  item: SpItem;
  isDragging?: boolean;
  compact?: boolean;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
  onUpdateValue?: (id: string, newValue: string) => void;
  onMergeStart?: (id: string) => void;
  onSplit?: (id: string) => void;
  isMergeTarget?: boolean;
  isMergeSource?: boolean;
}

export default function TierCard({
  item, isDragging, compact, onDelete, onRename, onUpdateValue, onMergeStart, onSplit,
  isMergeTarget, isMergeSource,
}: TierCardProps) {
  const { locale } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.featureName);
  const [isEditingValue, setIsEditingValue] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [editValue, setEditValue] = useState(item.paramValue || '');

  const handleSaveValue = () => {
    if (editValue !== item.paramValue) {
      onUpdateValue?.(item.id, editValue.trim());
    }
    setIsEditingValue(false);
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSaveName = () => {
    if (editName.trim() && editName !== item.featureName) {
      onRename?.(item.id, editName.trim());
    }
    setIsEditing(false);
  };

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs shadow-sm cursor-grab whitespace-nowrap touch-none select-none',
          (isDragging || isSortableDragging)
            ? 'opacity-50 shadow-lg ring-2 ring-slate-300 cursor-grabbing'
            : 'hover:shadow-md'
        )}
        {...attributes}
        {...listeners}
      >
        <span className="font-medium text-slate-700">{getDisplayName(item.featureName, locale)}</span>
        {item.paramValue && (
          <span className="text-slate-400 max-w-[120px] truncate">{item.paramValue}</span>
        )}
      </div>
    );
  }

  const isLeading = item.leadLevel === 'strong_lead' || item.leadLevel === 'slight_lead';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex items-start gap-1 rounded-md bg-white px-2 py-1.5 shadow-sm transition-all cursor-grab w-full touch-none select-none',
        (isDragging || isSortableDragging)
          ? 'opacity-50 shadow-lg ring-2 ring-slate-300 cursor-grabbing'
          : 'hover:shadow-md',
        isMergeTarget && 'ring-2 ring-blue-400 border-2 border-blue-300 bg-blue-50',
        isMergeSource && 'ring-2 ring-amber-400 border-2 border-amber-300',
        isLeading && !isMergeTarget && !isMergeSource
          ? 'border-2 border-red-400 ring-1 ring-red-200'
          : !isMergeTarget && !isMergeSource && 'border border-slate-200',
      )}
      {...attributes}
      {...listeners}
    >
      {/* Leading indicator: red upward arrow */}
      {isLeading && (
        <div className="absolute -top-2.5 -right-2.5 flex items-center justify-center">
          <div className="relative">
            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow">
              <TrendingUp className="h-3 w-3 text-white" />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Line 1: Param value (big, dark) */}
        {isEditingValue ? (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
            <input
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveValue(); if (e.key === 'Escape') setIsEditingValue(false); }}
              onBlur={handleSaveValue}
              className="text-sm font-semibold text-slate-900 border-b border-slate-300 bg-transparent outline-none w-full px-0 py-0"
            />
            <button onClick={handleSaveValue} className="text-green-500 hover:text-green-600 p-0.5">
              <Check className="h-3 w-3" />
            </button>
          </div>
        ) : item.paramValue ? (
          <p
            className="text-sm font-semibold text-slate-900 truncate cursor-text"
            onDoubleClick={e => { e.stopPropagation(); setEditValue(item.paramValue || ''); setIsEditingValue(true); }}
            title={locale === 'zh' ? '双击编辑参数值' : 'Double-click to edit value'}
          >
            {item.paramValue}
          </p>
        ) : null}

        {/* Line 2: Feature name (small, muted) */}
        {isEditing ? (
          <div className="flex items-center gap-1 mt-0.5" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
            <input
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setIsEditing(false); }}
              onBlur={handleSaveName}
              className="text-xs text-slate-400 border-b border-slate-300 bg-transparent outline-none w-full px-0 py-0"
            />
            <button onClick={handleSaveName} className="text-green-500 hover:text-green-600 p-0.5">
              <Check className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <p
            className="text-xs text-slate-400 mt-0.5 cursor-text"
            onDoubleClick={e => { e.stopPropagation(); setEditName(item.featureName); setIsEditing(true); }}
            title={locale === 'zh' ? '双击编辑名称' : 'Double-click to rename'}
          >
            {getDisplayName(item.featureName, locale)}
          </p>
        )}
        {/* Reasoning bubble */}
        {item.reasoning && (
          <div className="relative">
            {showReasoning ? (
              <div
                className="mt-1 p-1.5 rounded bg-blue-50 border border-blue-200 text-[10px] text-blue-700 leading-relaxed animate-in fade-in duration-150"
                onClick={e => { e.stopPropagation(); setShowReasoning(false); }}
                onPointerDown={e => e.stopPropagation()}
              >
                {item.reasoning}
              </div>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); setShowReasoning(true); }}
                onPointerDown={e => e.stopPropagation()}
                className="mt-0.5 flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-600 transition-colors"
              >
                <Info className="h-2.5 w-2.5" />
                <span>{locale === 'zh' ? '分级理由' : 'Why?'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action buttons — visible on hover */}
      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-all -mr-1 -mt-0.5">
        {onMergeStart && (
          <button
            onClick={e => { e.stopPropagation(); onMergeStart(item.id); }}
            onPointerDown={e => e.stopPropagation()}
            className={cn('transition-colors p-0.5', isMergeSource ? 'text-amber-500' : 'text-slate-300 hover:text-blue-500')}
            title={locale === 'zh' ? '合并卖点' : 'Merge'}
          >
            <Merge className="h-3 w-3" />
          </button>
        )}
        {onSplit && item.featureName.includes(' + ') && (
          <button
            onClick={e => { e.stopPropagation(); onSplit(item.id); }}
            onPointerDown={e => e.stopPropagation()}
            className="text-slate-300 hover:text-purple-500 transition-colors p-0.5"
            title={locale === 'zh' ? '拆分卖点' : 'Split'}
          >
            <Split className="h-3 w-3" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(item.id); }}
            onPointerDown={e => e.stopPropagation()}
            className="text-slate-300 hover:text-red-400 transition-colors p-0.5"
            title={locale === 'zh' ? '删除' : 'Delete'}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
