'use client';

import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, History, Sparkles, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpItem, PackagingVersion, SloganType, L3SubPoint } from '@/types';
import { useTranslation } from '@/lib/store';
import { cn } from '@/lib/utils';

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

const techniqueLabels: Record<string, { en: string; zh: string }> = {
  concrete: { en: 'Concrete', zh: '具象化' },
  equivalent: { en: 'Equivalent', zh: '等价换算' },
  extreme: { en: 'Extreme', zh: '极限表达' },
};

interface VersionCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SpItem;
  /** Called when user picks a version to use */
  onSelectVersion: (itemId: string, version: PackagingVersion) => void;
  /** Called when user wants to continue refining */
  onContinueRefine: () => void;
  /** The two versions to compare (left=old, right=new) */
  leftVersion: PackagingVersion | null;
  rightVersion: PackagingVersion | null;
  isRefining?: boolean;
}

function VersionCard({
  version,
  isCurrent,
  locale,
  onSelect,
}: {
  version: PackagingVersion;
  isCurrent: boolean;
  locale: string;
  onSelect: () => void;
}) {
  const zh = locale === 'zh';
  return (
    <div className={cn(
      'rounded-xl border-2 p-4 transition-all',
      isCurrent ? 'border-green-300 bg-green-50/30' : 'border-slate-200 bg-white hover:border-slate-300'
    )}>
      {/* Version header */}
      <div className="flex items-center justify-between mb-3">
        <Badge variant="outline" className="text-xs font-semibold">
          V{version.version}
        </Badge>
        {isCurrent && (
          <span className="text-[10px] text-green-600 font-medium">
            {zh ? '当前使用' : 'Current'}
          </span>
        )}
      </div>

      {/* L1 */}
      <div className="mb-2">
        <p className="text-[10px] text-slate-400 mb-0.5">L1</p>
        <p className="text-sm font-bold text-slate-900">{version.l1Name}</p>
      </div>

      {/* L2 Slogan */}
      <div className="mb-3">
        <p className="text-[10px] text-slate-400 mb-0.5">L2 Slogan</p>
        <p className="text-sm text-slate-700 italic">&ldquo;{version.l2Slogan}&rdquo;</p>
        <span className={cn(
          'text-[9px] px-1.5 py-0.5 rounded border mt-1 inline-block',
          sloganTypeColors[version.l2SloganType] || sloganTypeColors.functional,
        )}>
          {sloganTypeLabels[version.l2SloganType]?.[zh ? 'zh' : 'en'] || version.l2SloganType}
        </span>
      </div>

      {/* L3 */}
      {version.l3Details && version.l3Details.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-slate-400 mb-1">L3</p>
          <div className="space-y-1.5">
            {version.l3Details.map((sub: L3SubPoint, idx: number) => (
              <div key={idx} className="rounded bg-slate-50 px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-700">{sub.name}</p>
                  <span className="text-[9px] text-slate-400">
                    {zh ? techniqueLabels[sub.technique]?.zh : techniqueLabels[sub.technique]?.en}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{sub.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refinement prompt hint */}
      {version.refinementPrompt && (
        <div className="mt-2 pt-2 border-t border-dashed border-slate-200">
          <p className="text-[10px] text-slate-400">{zh ? '微调指令' : 'Refinement'}</p>
          <p className="text-[11px] text-slate-500 italic">{version.refinementPrompt}</p>
        </div>
      )}

      {/* Select button */}
      <Button
        size="sm"
        onClick={onSelect}
        disabled={isCurrent}
        className={cn(
          'w-full mt-3 gap-1.5',
          isCurrent ? 'bg-green-600' : 'bg-slate-800 hover:bg-slate-700'
        )}
      >
        <Check className="h-3.5 w-3.5" />
        {zh ? '选择此版本' : 'Use this version'}
      </Button>
    </div>
  );
}

export default function VersionCompareDialog({
  open,
  onOpenChange,
  item,
  onSelectVersion,
  onContinueRefine,
  leftVersion,
  rightVersion,
  isRefining,
}: VersionCompareDialogProps) {
  const { locale } = useTranslation();
  const zh = locale === 'zh';
  const versions = item.packagingVersions || [];
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);

  // Determine which version is "current" (matches item's l2Slogan)
  const currentSlogan = item.l2Slogan;

  // When browsing history, override leftVersion
  const displayLeft = historyIdx !== null && versions[historyIdx] ? versions[historyIdx] : leftVersion;
  const displayRight = rightVersion;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span>{item.featureName}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 font-normal">{zh ? '版本对比' : 'Version Compare'}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-2 gap-4 mt-2">
          {displayLeft ? (
            <VersionCard
              version={displayLeft}
              isCurrent={displayLeft.l2Slogan === currentSlogan}
              locale={locale}
              onSelect={() => onSelectVersion(item.id, displayLeft)}
            />
          ) : (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 flex items-center justify-center text-slate-300 text-sm">
              {zh ? '无旧版本' : 'No previous version'}
            </div>
          )}

          {displayRight ? (
            <VersionCard
              version={displayRight}
              isCurrent={displayRight.l2Slogan === currentSlogan}
              locale={locale}
              onSelect={() => onSelectVersion(item.id, displayRight)}
            />
          ) : isRefining ? (
            <div className="rounded-xl border-2 border-dashed border-slate-300 p-8 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <p className="text-sm text-slate-400">{zh ? '正在生成新版本...' : 'Generating new version...'}</p>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 flex items-center justify-center text-slate-300 text-sm">
              {zh ? '点击"继续微调"生成新版本' : 'Click "Continue Refining" to generate'}
            </div>
          )}
        </div>

        {/* Version history navigation */}
        {versions.length > 1 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <History className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">{zh ? '历史版本：' : 'History: '}</span>
            <div className="flex items-center gap-1">
              {versions.map((v, idx) => (
                <button
                  key={idx}
                  onClick={() => setHistoryIdx(historyIdx === idx ? null : idx)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full border transition-colors',
                    historyIdx === idx
                      ? 'bg-slate-800 text-white border-slate-800'
                      : v.l2Slogan === currentSlogan
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'text-slate-500 border-slate-200 hover:bg-slate-50'
                  )}
                >
                  V{v.version}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onContinueRefine}
            disabled={isRefining}
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {zh ? '继续微调' : 'Continue Refining'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {zh ? '关闭' : 'Close'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
