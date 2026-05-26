'use client';

import { useState, useCallback } from 'react';
import { Check, X, Loader2, Send, MessageSquare, RefreshCw, Pencil, History, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SpItem, SloganType, L3SubPoint, SloganAlternative, PackagingVersion } from '@/types';
import { useTranslation } from '@/lib/store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

/** Quick-suggestion chips for refinement */
const REFINEMENT_SUGGESTIONS: Array<{ zh: string; en: string }> = [
  { zh: '换成场景化表达', en: 'Use scenario-based expression' },
  { zh: '去掉极限词', en: 'Remove superlatives' },
  { zh: '更感性/情绪化', en: 'More emotional tone' },
  { zh: '更理性/数据向', en: 'More data-driven' },
  { zh: '加入竞品对比', en: 'Add competitor comparison' },
  { zh: '缩短精炼', en: 'Make it shorter & punchier' },
  { zh: '用等价换算手法', en: 'Use equivalence comparison' },
  { zh: '强调用户场景', en: 'Emphasize user scenarios' },
];

interface PackagingDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SpItem;
  onItemUpdate?: (itemId: string, updates: Partial<SpItem>) => void;
  onRefine?: (itemId: string, refinementPrompt: string) => Promise<void>;
  onRegenerate?: (itemId: string) => void;
  isRegenerating?: boolean;
}

export default function PackagingDetailDialog({
  open,
  onOpenChange,
  item,
  onItemUpdate,
  onRefine,
  onRegenerate,
  isRegenerating,
}: PackagingDetailDialogProps) {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState({ l1Name: '', l2Slogan: '', l2SloganType: 'functional' as SloganType });

  // Refinement
  const [refinementPrompt, setRefinementPrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // Version compare
  const [showVersions, setShowVersions] = useState(false);
  const [selectedVersionIdx, setSelectedVersionIdx] = useState<number | null>(null);

  const startEdit = () => {
    setEditDraft({
      l1Name: item.l1Name || '',
      l2Slogan: item.l2Slogan || '',
      l2SloganType: item.l2SloganType || 'functional',
    });
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (onItemUpdate) {
      onItemUpdate(item.id, editDraft);
      toast.success(zh ? '已保存' : 'Saved');
    }
    setIsEditing(false);
  };

  const handleRefine = useCallback(async () => {
    if (!refinementPrompt.trim() || !onRefine) return;
    setIsRefining(true);
    try {
      await onRefine(item.id, refinementPrompt.trim());
      setRefinementPrompt('');
      toast.success(zh ? '微调完成' : 'Refinement done');
    } catch {
      toast.error(zh ? '微调失败' : 'Refinement failed');
    } finally {
      setIsRefining(false);
    }
  }, [refinementPrompt, onRefine, item.id, zh]);

  const handleSwapAlternative = (alt: SloganAlternative, idx: number) => {
    if (!onItemUpdate) return;
    const oldSlogan = item.l2Slogan || '';
    const oldType = item.l2SloganType;
    const newAlts = [...(item.l2Alternatives || [])];
    newAlts[idx] = { text: oldSlogan, type: oldType || 'functional' };
    onItemUpdate(item.id, {
      l2Slogan: alt.text,
      l2SloganType: alt.type as SloganType,
      l2Alternatives: newAlts,
    });
    toast.success(zh ? 'Slogan 已替换' : 'Slogan swapped');
  };

  const handleSelectVersion = (version: PackagingVersion) => {
    if (!onItemUpdate) return;
    onItemUpdate(item.id, {
      l1Name: version.l1Name,
      l2Slogan: version.l2Slogan,
      l2SloganType: version.l2SloganType,
      l2Alternatives: version.l2Alternatives,
      l3Details: version.l3Details,
    });
    toast.success(zh ? `已恢复到 V${version.version}` : `Restored to V${version.version}`);
    setShowVersions(false);
  };

  const versions = item.packagingVersions || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">T{item.tier}</Badge>
            <span className="text-sm text-slate-500">{item.featureName}</span>
            {item.paramValue && (
              <span className="text-xs text-slate-400">· {item.paramValue}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* ── L1 Feature Name ── */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">L1 {zh ? '卖点名称' : 'Feature Name'}</p>
              {!isEditing && (
                <button onClick={startEdit} className="text-slate-400 hover:text-slate-600 p-0.5">
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
            {isEditing ? (
              <Input
                value={editDraft.l1Name}
                onChange={e => setEditDraft(d => ({ ...d, l1Name: e.target.value }))}
                className="text-sm font-bold"
                autoFocus
              />
            ) : (
              <p className="text-lg font-bold text-slate-900">{item.l1Name || '—'}</p>
            )}
          </section>

          {/* ── L2 Slogan ── */}
          <section>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">L2 Slogan</p>
            {isEditing ? (
              <div className="space-y-2">
                <Input
                  value={editDraft.l2Slogan}
                  onChange={e => setEditDraft(d => ({ ...d, l2Slogan: e.target.value }))}
                  className="text-sm"
                />
                <div className="flex gap-1.5">
                  {(['factual', 'functional', 'emotional'] as SloganType[]).map(st => (
                    <button
                      key={st}
                      onClick={() => setEditDraft(d => ({ ...d, l2SloganType: st }))}
                      className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                        editDraft.l2SloganType === st
                          ? sloganTypeColors[st]
                          : 'text-slate-300 border-slate-200'
                      )}
                    >
                      {sloganTypeLabels[st][zh ? 'zh' : 'en']}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-base text-slate-700 italic">&ldquo;{item.l2Slogan || '—'}&rdquo;</p>
                {item.l2SloganType && (
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full border mt-1.5 inline-block', sloganTypeColors[item.l2SloganType])}>
                    {sloganTypeLabels[item.l2SloganType]?.[zh ? 'zh' : 'en']}
                  </span>
                )}
              </div>
            )}

            {/* Edit save/cancel */}
            {isEditing && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={saveEdit} className="gap-1 bg-slate-800">
                  <Check className="h-3 w-3" /> {zh ? '保存' : 'Save'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="gap-1">
                  <X className="h-3 w-3" /> {zh ? '取消' : 'Cancel'}
                </Button>
              </div>
            )}

            {/* Alternative slogans */}
            {!isEditing && item.l2Alternatives && item.l2Alternatives.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-slate-400 font-medium">{zh ? '备选 Slogan（点击替换）' : 'Alternatives (click to use)'}</p>
                {item.l2Alternatives.map((alt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSwapAlternative(alt, idx)}
                    className="flex items-center gap-2 w-full text-left rounded-lg bg-slate-50 px-3 py-2 hover:bg-slate-100 transition-colors group"
                  >
                    <span className="text-sm text-slate-500 italic flex-1">&ldquo;{alt.text}&rdquo;</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border', sloganTypeColors[alt.type as SloganType] || sloganTypeColors.functional)}>
                      {sloganTypeLabels[alt.type as SloganType]?.[zh ? 'zh' : 'en'] || alt.type}
                    </span>
                    <span className="text-[10px] text-slate-300 group-hover:text-slate-500">{zh ? '替换' : 'use'}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── L3 Sub-points ── */}
          {item.l3Details && item.l3Details.length > 0 && (
            <section>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">
                L3 {zh ? '子卖点' : 'Sub-points'} ({item.l3Details.length})
              </p>
              <div className="space-y-2">
                {item.l3Details.map((sub: L3SubPoint, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                    <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{sub.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{sub.description}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0">
                      {zh ? techniqueLabels[sub.technique]?.zh : techniqueLabels[sub.technique]?.en}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Refinement Input ── */}
          {onRefine && !isEditing && (
            <section className="border-t border-slate-100 pt-4">
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">
                {zh ? '微调这个卖点' : 'Refine this item'}
              </p>
              {/* Quick suggestion chips */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {REFINEMENT_SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => setRefinementPrompt(prev =>
                      prev + (prev ? (zh ? '，' : ', ') : '') + (zh ? s.zh : s.en)
                    )}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  >
                    {zh ? s.zh : s.en}
                  </button>
                ))}
              </div>
              {/* Text input + send */}
              <div className="flex gap-2">
                <textarea
                  value={refinementPrompt}
                  onChange={e => setRefinementPrompt(e.target.value)}
                  placeholder={zh
                    ? '输入你的调整思路，例如：不要用极限词，换成场景化表达，强调大学生一整天不用充电...'
                    : 'Your refinement direction, e.g.: use scenario-based expression, emphasize all-day battery for students...'}
                  className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-slate-200 min-h-[80px]"
                  rows={3}
                />
                <Button
                  onClick={handleRefine}
                  disabled={!refinementPrompt.trim() || isRefining}
                  className="self-end bg-slate-800 hover:bg-slate-700 px-4"
                >
                  {isRefining
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </section>
          )}

          {/* ── Version History ── */}
          {versions.length > 0 && (
            <section className="border-t border-slate-100 pt-3">
              <button
                onClick={() => setShowVersions(!showVersions)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
              >
                <History className="h-3.5 w-3.5" />
                {zh ? `${versions.length} 个历史版本` : `${versions.length} version(s)`}
              </button>
              {showVersions && (
                <div className="mt-2 space-y-2">
                  {versions.map((v, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'rounded-lg border p-3 cursor-pointer transition-all',
                        selectedVersionIdx === idx ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                      )}
                      onClick={() => setSelectedVersionIdx(selectedVersionIdx === idx ? null : idx)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">V{v.version}</Badge>
                          <span className="text-xs text-slate-600 font-medium">{v.l1Name}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handleSelectVersion(v); }}
                          className="h-6 text-[10px] gap-1"
                        >
                          <Check className="h-3 w-3" />
                          {zh ? '恢复' : 'Restore'}
                        </Button>
                      </div>
                      {selectedVersionIdx === idx && (
                        <div className="mt-2 space-y-1 text-xs">
                          <p className="text-slate-600 italic">&ldquo;{v.l2Slogan}&rdquo;</p>
                          {v.refinementPrompt && (
                            <p className="text-slate-400">
                              <span className="font-medium">{zh ? '微调指令：' : 'Prompt: '}</span>
                              {v.refinementPrompt}
                            </p>
                          )}
                          {v.l3Details && v.l3Details.length > 0 && (
                            <p className="text-slate-400">{v.l3Details.length} {zh ? '个子卖点' : 'sub-points'}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── Bottom Actions ── */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="flex gap-2">
              {onRegenerate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRegenerate(item.id)}
                  disabled={isRegenerating}
                  className="gap-1.5 text-xs"
                >
                  {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {zh ? '重新生成' : 'Regenerate'}
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {zh ? '关闭' : 'Close'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
