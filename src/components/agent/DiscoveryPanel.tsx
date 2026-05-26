'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Loader2, CheckSquare, Square, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/store';
import { cn } from '@/lib/utils';

import AgentProgressPanel from '@/components/agent/AgentProgressPanel';
import { useAgentStream } from '@/lib/useAgentStream';

/** Progress step shape (matches the interface in useAgentStream) */
interface AgentProgressStep {
  step: string;
  detail: string;
  progress: number;
}

// ─── Types ──────────────────────────────────────────────────────

interface DiscoveredCompetitor {
  name: string;
  params: Record<string, string>;
  rationale?: string;
}

interface DiscoveryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  market?: string;
  onAddCompetitors: (
    competitors: Array<{ name: string; params: Record<string, string> }>
  ) => void;
}

// Key param labels for display cards
const KEY_PARAM_LABELS: Record<string, { en: string; zh: string }> = {
  'platform.chipset': { en: 'Chipset', zh: '芯片' },
  'battery.type': { en: 'Battery', zh: '电池' },
  'battery.charging': { en: 'Charging', zh: '充电' },
  'display.type': { en: 'Display', zh: '屏幕' },
  'display.size': { en: 'Screen', zh: '屏幕尺寸' },
  'camera.specs': { en: 'Camera', zh: '摄像头' },
  'memory.internal': { en: 'Memory', zh: '内存' },
  'misc.price': { en: 'Price', zh: '价格' },
  'body.weight': { en: 'Weight', zh: '重量' },
};

/** Pick up to 5 most important params to show on a card. */
function pickKeyParams(params: Record<string, string>): Array<{ key: string; label: string; value: string; zh: string }> {
  const priority = [
    'platform.chipset',
    'misc.price',
    'battery.type',
    'display.type',
    'camera.specs',
    'memory.internal',
    'battery.charging',
    'body.weight',
    'display.size',
  ];
  const result: Array<{ key: string; label: string; value: string; zh: string }> = [];
  for (const key of priority) {
    if (params[key] && result.length < 5) {
      const meta = KEY_PARAM_LABELS[key] || { en: key, zh: key };
      result.push({ key, label: meta.en, value: params[key], zh: meta.zh });
    }
  }
  return result;
}

// ─── localStorage helpers ───────────────────────────────────────

function loadSavedInputs(projectId: string): { category: string; priceRange: string } {
  try {
    const raw = localStorage.getItem(`sp-discovery-${projectId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        category: parsed.category || '',
        priceRange: parsed.priceRange || '',
      };
    }
  } catch { /* ignore */ }
  return { category: '', priceRange: '' };
}

function saveInputs(projectId: string, category: string, priceRange: string) {
  try {
    localStorage.setItem(
      `sp-discovery-${projectId}`,
      JSON.stringify({ category, priceRange })
    );
  } catch { /* ignore */ }
}

// ─── Component ──────────────────────────────────────────────────

export default function DiscoveryPanel({
  open,
  onOpenChange,
  projectId,
  market,
  onAddCompetitors,
}: DiscoveryPanelProps) {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  // Form state — restore from localStorage
  const [category, setCategory] = useState('');
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    const saved = loadSavedInputs(projectId);
    if (saved.category) setCategory(saved.category);
    initializedRef.current = true;
  }, [projectId]);

  // Persist inputs to localStorage on change
  useEffect(() => {
    if (!initializedRef.current) return;
    saveInputs(projectId, category, '');
  }, [projectId, category]);

  // Discovery results
  const [competitors, setCompetitors] = useState<DiscoveredCompetitor[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Agent stream
  const { run, running, steps, error, abort } = useAgentStream('discovery', {
    onProgress: () => {
      // Progress is tracked via steps
    },
    onDone: (result: Record<string, unknown>) => {
      // Parse competitors from agent result
      // The agent returns { success, summary, data }
      // Competitors may be in data.competitors, or in the summary JSON
      let comps: DiscoveredCompetitor[] = [];

      // Try data.competitors first
      const dataObj = (result.data || result) as Record<string, unknown>;
      if (Array.isArray(dataObj.competitors)) {
        comps = dataObj.competitors as DiscoveredCompetitor[];
      }

      // Fallback: parse from summary text (agent returns JSON in final response)
      if (comps.length === 0 && typeof result.summary === 'string') {
        try {
          const jsonMatch = result.summary.match(/\{[\s\S]*"competitors"[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed.competitors)) {
              comps = parsed.competitors as DiscoveredCompetitor[];
            }
          }
        } catch { /* ignore parse errors */ }
      }

      setCompetitors(comps);
      // Auto-select all
      setSelected(new Set(comps.map((c) => c.name)));
    },
    onError: () => {
      // Error shown via AgentProgressPanel
    },
  });

  const handleDiscover = useCallback(async () => {
    if (!category.trim()) return;
    setCompetitors([]);
    setSelected(new Set());

    const marketStr = market || 'Global';
    await run({
      message: `Find competitors for: ${category.trim()}, ${marketStr} market`,
      category: category.trim(),
      priceRange: '',
      market: marketStr,
      locale,
    });
  }, [category, market, locale, run]);

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleAdd = () => {
    const toAdd = competitors
      .filter((c) => selected.has(c.name))
      .map((c) => ({ name: c.name, params: c.params }));
    if (toAdd.length > 0) {
      onAddCompetitors(toAdd);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {zh ? '发现竞品' : 'Discover Competitors'}
          </SheetTitle>
          <SheetDescription>
            {zh
              ? '输入产品类别，自动搜索并推荐竞品'
              : 'Enter product category to search and recommend competitors'}
          </SheetDescription>
        </SheetHeader>

        {/* Input Form */}
        <div className="px-4 space-y-3">
          {/* Category */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              {zh ? '产品类别' : 'Product Category'}
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={zh ? '例: 中端手机' : 'e.g. mid-range phone'}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              disabled={running}
            />
          </div>

          {/* Market (auto-filled, read-only) */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              {zh ? '目标市场' : 'Market'}
            </label>
            <input
              type="text"
              value={market || ''}
              readOnly
              className="w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
          </div>

          {/* Discover button */}
          <Button
            onClick={handleDiscover}
            disabled={running || !category.trim()}
            className="w-full"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {zh ? '搜索中...' : 'Searching...'}
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                {zh ? '发现竞品' : 'Discover'}
              </>
            )}
          </Button>

          {running && (
            <Button
              variant="outline"
              size="sm"
              onClick={abort}
              className="w-full"
            >
              {zh ? '取消' : 'Cancel'}
            </Button>
          )}
        </div>

        {/* Progress Panel */}
        {steps.length > 0 && (
          <div className="px-4 mt-4">
            <AgentProgressPanel steps={steps} error={error} />
          </div>
        )}

        {/* Results */}
        {competitors.length > 0 && (
          <div className="px-4 mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-600">
                {zh
                  ? `发现 ${competitors.length} 个竞品`
                  : `Found ${competitors.length} competitors`}
              </p>
              <button
                onClick={() => {
                  if (selected.size === competitors.length) {
                    setSelected(new Set());
                  } else {
                    setSelected(new Set(competitors.map((c) => c.name)));
                  }
                }}
                className="text-[11px] text-slate-500 hover:text-slate-700"
              >
                {selected.size === competitors.length
                  ? (zh ? '取消全选' : 'Deselect all')
                  : (zh ? '全选' : 'Select all')}
              </button>
            </div>

            {competitors.map((comp) => {
              const isSelected = selected.has(comp.name);
              const keyParams = pickKeyParams(comp.params);

              return (
                <div
                  key={comp.name}
                  onClick={() => toggleSelect(comp.name)}
                  className={cn(
                    'rounded-xl border p-3 cursor-pointer transition-all',
                    isSelected
                      ? 'border-slate-400 bg-slate-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {isSelected ? (
                      <CheckSquare className="h-4 w-4 text-slate-700 mt-0.5 shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {comp.name}
                      </p>
                      {comp.rationale && (
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                          {comp.rationale}
                        </p>
                      )}
                      {/* Key params */}
                      {keyParams.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {keyParams.map((kp) => (
                            <span
                              key={kp.key}
                              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
                            >
                              <span className="text-slate-400">
                                {zh ? kp.zh : kp.label}
                              </span>
                              <span className="font-medium text-slate-700 truncate max-w-[120px]">
                                {kp.value}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer: Add selected */}
        {competitors.length > 0 && (
          <SheetFooter>
            <Button
              onClick={handleAdd}
              disabled={selected.size === 0}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              {zh
                ? `添加 ${selected.size} 个竞品到项目`
                : `Add ${selected.size} competitor${selected.size !== 1 ? 's' : ''} to project`}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
