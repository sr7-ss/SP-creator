'use client';

import { Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpItem, L3SubPoint } from '@/types';
import { useTranslation } from '@/lib/store';
import { cn } from '@/lib/utils';

interface PackagingViewProps {
  items: SpItem[];
  onGenerate?: () => void;
  onItemUpdate?: (itemId: string, updates: Partial<SpItem>) => void;
  onDeleteItem?: (itemId: string) => void;
  onSelectItem: (item: SpItem) => void;
  isGenerating?: boolean;
  extraButtons?: React.ReactNode;
}

export default function PackagingView({
  items,
  onGenerate,
  onDeleteItem,
  onSelectItem,
  isGenerating,
  extraButtons,
}: PackagingViewProps) {
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';

  const tiers = [
    { tier: 1, label: t('ksp.tier1'), color: 'border-l-red-400' },
    { tier: 2, label: t('ksp.tier2'), color: 'border-l-amber-400' },
    { tier: 3, label: t('ksp.tier3'), color: 'border-l-slate-300' },
  ] as const;

  const hasPackaging = items.some(item => item.l1Name);

  return (
    <div className="space-y-4">
      {/* No packaging yet — prominent centered CTA */}
      {!hasPackaging && items.length > 0 && onGenerate && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center shadow-lg">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <div className="text-center">
            <p className="text-base font-medium text-slate-700">
              {zh ? '为每个 SP 生成三层卖点包装' : 'Generate 3-layer packaging for each SP'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {zh ? 'L1 卖点名称 · L2 Slogan · L3 子卖点' : 'L1 Feature Name · L2 Slogan · L3 Sub-points'}
            </p>
          </div>
          <Button
            onClick={onGenerate}
            disabled={isGenerating}
            className="gap-2.5 bg-slate-800 hover:bg-slate-700 px-8 py-6 text-base rounded-xl shadow-lg"
          >
            {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            {isGenerating
              ? (zh ? 'AI 生成中...' : 'Generating...')
              : (zh ? 'AI 生成包装' : 'AI Generate Packaging')}
          </Button>
        </div>
      )}

      {/* Toolbar */}
      {hasPackaging && (onGenerate || extraButtons) && (
        <div className="flex items-center gap-3">
          {onGenerate && (
            <Button
              onClick={onGenerate}
              disabled={isGenerating}
              className="gap-2 bg-slate-800 hover:bg-slate-900"
              size="sm"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? t('packaging.generating') : (zh ? '重新生成全部' : 'Regenerate All')}
            </Button>
          )}
          {extraButtons && (
            <div className="ml-auto flex items-center gap-2">
              {extraButtons}
            </div>
          )}
        </div>
      )}

      {/* Packaging Results — 3-column layout with simplified clickable cards */}
      {hasPackaging && (
        <div className="grid grid-cols-3 gap-3">
          {tiers.map(({ tier, label, color }) => {
            const tierItems = items.filter(i => i.tier === tier && i.l1Name);
            const headerColors = tier === 1
              ? 'bg-red-50 border-red-200'
              : tier === 2
              ? 'bg-amber-50 border-amber-200'
              : 'bg-slate-50 border-slate-200';
            const countColor = tier === 1
              ? 'text-red-500'
              : tier === 2
              ? 'text-amber-500'
              : 'text-slate-400';

            return (
              <div key={tier} className={cn('rounded-xl border-2 p-3 min-h-[200px]', headerColors)}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={cn('text-sm font-semibold', countColor)}>{label}</h3>
                  <span className={cn('text-xs font-medium', countColor)}>{tierItems.length}</span>
                </div>

                <div className="space-y-2">
                  {tierItems.map(item => (
                    <div
                      key={item.id}
                      onClick={() => onSelectItem(item)}
                      className={cn(
                        'rounded-lg border bg-white border-l-4 px-3 py-2.5 cursor-pointer transition-all group',
                        'hover:shadow-md hover:border-slate-300 hover:bg-slate-50/50',
                        color
                      )}
                    >
                      {/* L1 name + delete action */}
                      <div className="flex items-start justify-between">
                        <h4 className="text-sm font-extrabold text-slate-900 truncate flex-1 min-w-0">{item.l1Name}</h4>
                        {onDeleteItem && (
                          <button
                            onClick={e => { e.stopPropagation(); onDeleteItem(item.id); }}
                            className="text-slate-200 hover:text-red-400 transition-colors p-0.5 flex-shrink-0 ml-1 opacity-0 group-hover:opacity-100"
                            title={zh ? '删除' : 'Delete'}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* L2 Slogan */}
                      {item.l2Slogan && (
                        <p className="mt-1 text-xs text-slate-600 italic truncate">&ldquo;{item.l2Slogan}&rdquo;</p>
                      )}

                      {/* L3 Sub-point titles — horizontal */}
                      {item.l3Details && item.l3Details.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {item.l3Details.map((sub: L3SubPoint, idx: number) => (
                            <span key={idx} className="text-[11px] text-slate-700 bg-slate-100 rounded px-1.5 py-0.5">
                              {idx + 1}. {sub.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {tierItems.length === 0 && (
                    <p className="text-xs text-slate-300 text-center py-8">
                      {zh ? '暂无卖点' : 'No items'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
