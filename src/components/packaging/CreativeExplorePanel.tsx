'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Sparkles, Trophy, AlertTriangle, Check } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AgentProgressPanel from '@/components/agent/AgentProgressPanel';
import { useAgentStream } from '@/lib/useAgentStream';
import { useTranslation } from '@/lib/store';
import { loadSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import type { KspItem, SloganType } from '@/types';

interface CreativeExplorePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: KspItem | null;
  productName: string;
  segment?: string;
  competitorContext?: string;
  onSelect: (itemId: string, slogan: string, sloganType: SloganType) => void;
}

interface ExploredVariant {
  text: string;
  type: SloganType;
  rationale: string;
  score: number;
  issues: string[];
  strengths: string[];
  hasConflict: boolean;
  conflictNote: string;
}

interface ExploreResult {
  recommendation: { bestIndex: number; reasoning: string };
  variants: ExploredVariant[];
}

const typeColors: Record<SloganType, { bg: string; text: string; border: string }> = {
  factual: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  functional: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  emotional: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

function scoreColor(score: number): string {
  if (score >= 8) return 'bg-green-500';
  if (score >= 6) return 'bg-amber-500';
  return 'bg-red-400';
}

export default function CreativeExplorePanel({
  open,
  onOpenChange,
  item,
  productName,
  segment,
  competitorContext,
  onSelect,
}: CreativeExplorePanelProps) {
  const { t, locale } = useTranslation();
  const [result, setResult] = useState<ExploreResult | null>(null);
  const prevItemIdRef = useRef<string | null>(null);

  const { run, running, steps, error, abort } = useAgentStream('creative', {
    onDone: (data) => {
      // The agent's final output should be the recommendation + variants
      if (data.variants && data.recommendation) {
        setResult(data as unknown as ExploreResult);
      } else if (data.summary) {
        // Try parsing the summary as JSON
        try {
          const parsed = JSON.parse(data.summary as string);
          if (parsed.variants) setResult(parsed as ExploreResult);
        } catch {
          // If not JSON, try to extract from data directly
          if (data.data && typeof data.data === 'object') {
            const d = data.data as Record<string, unknown>;
            if (d.variants) setResult(d as unknown as ExploreResult);
          }
        }
      }
    },
  });

  const startExploration = useCallback(() => {
    if (!item || running) return;

    const settings = loadSettings();
    const brandRules = settings.brandNamingRules || [];
    const providerConfig = settings.aiProviders[settings.activeProvider];

    setResult(null);
    run({
      message: `Explore creative L2 slogan variants for: ${item.featureName} (${item.paramValue}), T${item.tier} feature of ${productName}`,
      featureName: item.featureName,
      paramValue: item.paramValue,
      tier: item.tier,
      productName,
      segment: segment || '',
      competitorContext: competitorContext || '',
      brandRules,
      locale,
    });
  }, [item, running, productName, segment, competitorContext, locale, run]);

  // Auto-start when opening with a new item
  useEffect(() => {
    if (open && item && item.id !== prevItemIdRef.current) {
      prevItemIdRef.current = item.id;
      startExploration();
    }
    if (!open) {
      prevItemIdRef.current = null;
    }
  }, [open, item, startExploration]);

  const handleClose = () => {
    if (running) abort();
    onOpenChange(false);
  };

  const handleSelect = (variant: ExploredVariant) => {
    if (!item) return;
    const sloganType: SloganType = (['factual', 'functional', 'emotional'].includes(variant.type))
      ? variant.type
      : 'functional';
    onSelect(item.id, variant.text, sloganType);
    onOpenChange(false);
  };

  const zh = locale === 'zh';

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-purple-500" />
            {zh ? 'AI 创意探索' : 'AI Creative Exploration'}
          </SheetTitle>
          {item && (
            <SheetDescription className="text-xs text-slate-500">
              <span className="font-medium text-slate-700">{item.featureName}</span>
              {' '}&mdash;{' '}
              <span>{item.paramValue}</span>
              {item.l2Slogan && (
                <>
                  {' '}| {zh ? '当前' : 'Current'}: <span className="italic">&ldquo;{item.l2Slogan}&rdquo;</span>
                </>
              )}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="space-y-4 mt-2 px-4 pb-4">
          {/* Progress */}
          <AgentProgressPanel steps={steps} error={error} />

          {/* Results */}
          {result && result.variants && result.variants.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">
                {zh ? '变体比较' : 'Variant Comparison'}
              </h3>

              {result.variants.map((variant, idx) => {
                const isBest = result.recommendation?.bestIndex === idx;
                const tc = typeColors[variant.type] || typeColors.functional;

                return (
                  <div
                    key={idx}
                    className={cn(
                      'rounded-lg border p-3 space-y-2 transition-all',
                      isBest
                        ? 'border-amber-300 bg-amber-50/50 ring-1 ring-amber-200'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    )}
                  >
                    {/* Top row: slogan text + badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          &ldquo;{variant.text}&rdquo;
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] px-1.5 py-0', tc.bg, tc.text, tc.border)}
                        >
                          {t(`packaging.sloganType.${variant.type}`)}
                        </Badge>
                        {isBest && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0 gap-0.5">
                            <Trophy className="h-2.5 w-2.5" />
                            {zh ? '推荐' : 'Best'}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', scoreColor(variant.score))}
                          style={{ width: `${(variant.score / 10) * 100}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-600 w-6 text-right">
                        {variant.score}
                      </span>
                    </div>

                    {/* Rationale */}
                    {variant.rationale && (
                      <p className="text-[11px] text-slate-500">{variant.rationale}</p>
                    )}

                    {/* Strengths */}
                    {variant.strengths && variant.strengths.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {variant.strengths.map((s, si) => (
                          <span key={si} className="text-[10px] bg-green-50 text-green-600 border border-green-200 rounded px-1.5 py-0.5">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Issues */}
                    {variant.issues && variant.issues.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {variant.issues.map((iss, ii) => (
                          <span key={ii} className="text-[10px] bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5 flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {iss}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Conflict warning */}
                    {variant.hasConflict && variant.conflictNote && (
                      <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        {zh ? '竞品冲突: ' : 'Competitor conflict: '}{variant.conflictNote}
                      </p>
                    )}

                    {/* Use this button */}
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant={isBest ? 'default' : 'outline'}
                        className={cn(
                          'h-7 text-[11px] gap-1',
                          isBest && 'bg-amber-600 hover:bg-amber-700'
                        )}
                        onClick={() => handleSelect(variant)}
                      >
                        <Check className="h-3 w-3" />
                        {zh ? '使用此方案' : 'Use this'}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Recommendation reasoning */}
              {result.recommendation?.reasoning && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p className="text-[11px] text-slate-500 font-medium mb-1">
                    {zh ? '推荐理由' : 'Recommendation Reasoning'}
                  </p>
                  <p className="text-xs text-slate-700">{result.recommendation.reasoning}</p>
                </div>
              )}
            </div>
          )}

          {/* Retry button if errored */}
          {error && !running && (
            <Button
              size="sm"
              variant="outline"
              onClick={startExploration}
              className="h-8 text-xs gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {zh ? '重试' : 'Retry'}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
