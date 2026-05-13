'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { PACKAGING_STRATEGIES, DEFAULT_STRATEGY_KEY } from '@/lib/constants/slogan-strategies';

export interface ProductPositioning {
  targetAudience: string;
  productStyle: string[];
  positioning: string;
  /** KSP packaging from a previous project to use as style reference */
  referencePackaging?: string;
  /** Selected knowledge entry IDs to include */
  knowledgeEntryIds?: string[];
  /** Packaging strategy key (e.g. "value-for-money"). Determines slogan type per KSP tier. */
  packagingStrategy?: string;
}

interface ProjectOption {
  id: string;
  name: string;
  segment?: string;
  hasPackaging: boolean;
}

interface KnowledgeOption {
  id: string;
  feature: string;
  title: string;
  entryType: string;
}

const STYLE_OPTIONS = [
  { zh: '科技感', en: 'Tech-forward' },
  { zh: '年轻潮酷', en: 'Young & trendy' },
  { zh: '商务稳重', en: 'Business' },
  { zh: '性价比', en: 'Value-for-money' },
  { zh: '高端旗舰', en: 'Premium flagship' },
  { zh: '影像专业', en: 'Camera-pro' },
  { zh: '游戏电竞', en: 'Gaming' },
  { zh: '轻薄时尚', en: 'Slim & stylish' },
  { zh: '长续航', en: 'Long battery' },
  { zh: '耐用可靠', en: 'Durable' },
];

interface PositioningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (positioning: ProductPositioning) => void;
  initial?: Partial<ProductPositioning>;
  locale: string;
  currentProjectId: string;
}

export default function PositioningDialog({
  open,
  onOpenChange,
  onConfirm,
  initial,
  locale,
  currentProjectId,
}: PositioningDialogProps) {
  const zh = locale === 'zh';
  const [targetAudience, setTargetAudience] = useState(initial?.targetAudience || '');
  const [selectedStyles, setSelectedStyles] = useState<string[]>(initial?.productStyle || []);
  const [positioning, setPositioning] = useState(initial?.positioning || '');
  const [packagingStrategy, setPackagingStrategy] = useState<string>(initial?.packagingStrategy || DEFAULT_STRATEGY_KEY);

  // Reference project (延续上一代包装风格)
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedRefProject, setSelectedRefProject] = useState<string>('');
  const [showRefSection, setShowRefSection] = useState(false);

  // Knowledge templates
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeOption[]>([]);
  const [selectedKnowledge, setSelectedKnowledge] = useState<Set<string>>(new Set());
  const [showKbSection, setShowKbSection] = useState(false);

  // Load projects + knowledge when dialog opens
  useEffect(() => {
    if (!open) return;

    // Fetch other projects that have packaging results
    fetch('/api/projects')
      .then(r => r.json())
      .then((data: { id: string; name: string; segment?: string; _count?: { kspResults: number } }[]) => {
        const opts = (Array.isArray(data) ? data : [])
          .filter(p => p.id !== currentProjectId)
          .map(p => ({
            id: p.id,
            name: p.name,
            segment: p.segment,
            hasPackaging: (p._count?.kspResults || 0) > 0,
          }));
        setProjects(opts);
      })
      .catch(() => {});

    // Fetch knowledge entries (packaging + brand_name types)
    fetch('/api/knowledge?entryType=packaging,brand_name')
      .then(r => r.json())
      .then((data: { entries?: KnowledgeOption[] }) => {
        setKnowledgeEntries(data.entries || []);
      })
      .catch(() => {});
  }, [open, currentProjectId]);

  const toggleStyle = (style: string) => {
    setSelectedStyles(prev =>
      prev.includes(style) ? prev.filter(s => s !== style) : [...prev, style]
    );
  };

  const toggleKnowledge = (id: string) => {
    setSelectedKnowledge(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    // If a reference project is selected, fetch its packaging data
    let referencePackaging: string | undefined;
    if (selectedRefProject) {
      try {
        const res = await fetch(`/api/projects/${selectedRefProject}`);
        if (res.ok) {
          const data = await res.json();
          const kspResults = data.kspResults || [];
          const packaged = kspResults.filter((r: { l1Name?: string }) => r.l1Name);
          if (packaged.length > 0) {
            referencePackaging = packaged.map((r: { featureName: string; l1Name: string; l2Slogan: string; l2SloganType: string }) =>
              `${r.featureName}: L1="${r.l1Name}" L2="${r.l2Slogan}" (${r.l2SloganType})`
            ).join('\n');
          }
        }
      } catch { /* ignore */ }
    }

    onConfirm({
      targetAudience: targetAudience.trim(),
      productStyle: selectedStyles,
      positioning: positioning.trim(),
      referencePackaging,
      knowledgeEntryIds: selectedKnowledge.size > 0 ? Array.from(selectedKnowledge) : undefined,
      packagingStrategy,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{zh ? '产品定位' : 'Product Positioning'}</DialogTitle>
          <p className="text-xs text-slate-400 mt-1">
            {zh ? '帮助 AI 生成更贴合产品定位的卖点包装' : 'Help AI generate packaging aligned with your product positioning'}
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Target audience */}
          <div className="space-y-2">
            <Label className="text-slate-700 text-sm">
              {zh ? '目标用户' : 'Target Audience'}
            </Label>
            <Input
              value={targetAudience}
              onChange={e => setTargetAudience(e.target.value)}
              placeholder={zh ? '如：18-25岁游戏玩家、商务人士' : 'e.g. 18-25 gamers'}
              className="text-sm"
            />
          </div>

          {/* Product style tags */}
          <div className="space-y-2">
            <Label className="text-slate-700 text-sm">
              {zh ? '产品调性' : 'Product Style'}
              <span className="text-slate-400 text-xs ml-1">({zh ? '可多选' : 'multi-select'})</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {STYLE_OPTIONS.map(opt => {
                const label = zh ? opt.zh : opt.en;
                const isSelected = selectedStyles.includes(opt.zh);
                return (
                  <button
                    key={opt.zh}
                    onClick={() => toggleStyle(opt.zh)}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-full border transition-all',
                      isSelected
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Free-form positioning */}
          <div className="space-y-2">
            <Label className="text-slate-700 text-sm">
              {zh ? '一句话描述产品定位' : 'Product positioning'}
              <span className="text-slate-400 text-xs ml-1">({zh ? '选填' : 'optional'})</span>
            </Label>
            <Input
              value={positioning}
              onChange={e => setPositioning(e.target.value)}
              placeholder={zh ? '如：主打游戏性能的中低价位手机' : 'e.g. mid-range gaming phone'}
              className="text-sm"
            />
          </div>

          {/* Packaging strategy (决定每个 KSP 的 Slogan 类型分配) */}
          <div className="space-y-2">
            <Label className="text-slate-700 text-sm">
              {zh ? '包装策略' : 'Packaging Strategy'}
              <span className="text-slate-400 text-xs ml-1">
                ({zh ? '决定每个卖点用哪种 Slogan 类型' : 'decides slogan type per KSP'})
              </span>
            </Label>
            <div className="space-y-1.5">
              {Object.values(PACKAGING_STRATEGIES).map(s => {
                const isSelected = packagingStrategy === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setPackagingStrategy(s.key)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg border transition-all',
                      isSelected
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn('w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center',
                        isSelected ? 'bg-white border-white' : 'border-slate-300'
                      )}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />}
                      </div>
                      <span className="text-sm font-medium">
                        {zh ? s.label.zh : s.label.en}
                      </span>
                    </div>
                    <p className={cn('text-[10px] mt-0.5 ml-5', isSelected ? 'text-slate-200' : 'text-slate-400')}>
                      {zh ? s.description.zh : s.description.en}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── Reference project (延续上一代包装风格) ─── */}
          <div className="border-t border-slate-100 pt-4">
            <button
              onClick={() => setShowRefSection(!showRefSection)}
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800 transition-colors w-full"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !showRefSection && '-rotate-90')} />
              {zh ? '延续上一代产品包装风格' : 'Follow previous product style'}
              <span className="text-xs text-slate-400 ml-auto">{zh ? '选填' : 'optional'}</span>
            </button>
            {showRefSection && (
              <div className="mt-2">
                <select
                  value={selectedRefProject}
                  onChange={e => setSelectedRefProject(e.target.value)}
                  className="w-full h-8 px-2 text-sm border rounded-md bg-white text-slate-700"
                >
                  <option value="">{zh ? '不选择' : 'None'}</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.segment ? ` (${p.segment})` : ''}
                    </option>
                  ))}
                </select>
                {selectedRefProject && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    {zh ? 'AI 将参考该项目的包装风格生成新包装' : 'AI will reference this project\'s packaging style'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ─── Knowledge templates ─── */}
          {knowledgeEntries.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <button
                onClick={() => setShowKbSection(!showKbSection)}
                className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800 transition-colors w-full"
              >
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !showKbSection && '-rotate-90')} />
                {zh ? '使用知识库模板' : 'Use knowledge templates'}
                {selectedKnowledge.size > 0 && (
                  <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full ml-1">
                    {selectedKnowledge.size}
                  </span>
                )}
                <span className="text-xs text-slate-400 ml-auto">{zh ? '选填' : 'optional'}</span>
              </button>
              {showKbSection && (
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {knowledgeEntries.map(entry => (
                    <button
                      key={entry.id}
                      onClick={() => toggleKnowledge(entry.id)}
                      className={cn(
                        'w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all',
                        selectedKnowledge.has(entry.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
                      )}
                    >
                      <div className={cn('w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center',
                        selectedKnowledge.has(entry.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                      )}>
                        {selectedKnowledge.has(entry.id) && <span className="text-white text-[8px]">✓</span>}
                      </div>
                      <span className="text-slate-500 flex-shrink-0">{entry.feature}</span>
                      <span className="text-slate-700 truncate">{entry.title}</span>
                      <span className={cn('text-[9px] px-1 py-0.5 rounded flex-shrink-0',
                        entry.entryType === 'brand_name' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
                      )}>
                        {entry.entryType === 'brand_name' ? (zh ? '营销名' : 'Name') : (zh ? '模板' : 'Template')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleConfirm}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              {zh ? '跳过，直接生成' : 'Skip'}
            </button>
            <Button
              onClick={handleConfirm}
              className="bg-slate-800 hover:bg-slate-900"
            >
              {zh ? '开始生成' : 'Generate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
