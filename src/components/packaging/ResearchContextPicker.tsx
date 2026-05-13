'use client';

import { useState, useEffect } from 'react';
import { Search, Check, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from '@/lib/store';
import { cn } from '@/lib/utils';

interface ResearchMention {
  rank: number;
  topic: string;
  mentionRate: string;
  finding: string;
  quotes: string[];
}

interface SavedReport {
  id: string;
  query: string;
  summary: string;
  topPros: ResearchMention[];
  topCons: ResearchMention[];
  recommendations: string[];
  createdAt: string;
}

interface ResearchContextPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onConfirm: (context: string) => void;
}

export default function ResearchContextPicker({
  open,
  onOpenChange,
  projectId,
  onConfirm,
}: ResearchContextPickerProps) {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Fetch reports when opened
  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    fetch(`/api/research?projectId=${projectId}`)
      .then(r => r.json())
      .then(data => {
        const raw = data.reports || [];
        setReports(raw.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          query: r.query as string || '',
          summary: r.summary as string || '',
          topPros: (r.insights && typeof r.insights === 'object' && !Array.isArray(r.insights))
            ? ((r.insights as Record<string, unknown>).topPros as ResearchMention[] || [])
            : [],
          topCons: (r.insights && typeof r.insights === 'object' && !Array.isArray(r.insights))
            ? ((r.insights as Record<string, unknown>).topCons as ResearchMention[] || [])
            : [],
          recommendations: (r.recommendations as string[]) || [],
          createdAt: r.createdAt as string || '',
        })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open, projectId]);

  const toggleItem = (key: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    // Build context string from selected items
    const parts: string[] = [];
    for (const report of reports) {
      for (const pro of report.topPros) {
        if (selectedItems.has(`pro-${report.id}-${pro.rank}`)) {
          parts.push(`[优势] ${pro.topic}（提及率 ${pro.mentionRate}）: ${pro.finding}`);
        }
      }
      for (const con of report.topCons) {
        if (selectedItems.has(`con-${report.id}-${con.rank}`)) {
          parts.push(`[劣势] ${con.topic}（提及率 ${con.mentionRate}）: ${con.finding}`);
        }
      }
      for (const [idx, rec] of report.recommendations.entries()) {
        if (selectedItems.has(`rec-${report.id}-${idx}`)) {
          parts.push(`[建议] ${rec}`);
        }
      }
    }
    onConfirm(parts.join('\n'));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            {zh ? '引用调研结论' : 'Select Research Findings'}
          </DialogTitle>
          <p className="text-xs text-slate-400 mt-1">
            {zh ? '勾选要注入卖点包装的调研发现' : 'Check findings to inject into packaging prompt'}
          </p>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            {zh ? '加载中...' : 'Loading...'}
          </div>
        ) : reports.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <FileText className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">{zh ? '暂无调研报告' : 'No research reports yet'}</p>
            <p className="text-xs mt-1">{zh ? '先去 Deep Research 生成报告' : 'Generate a report in Deep Research first'}</p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {reports.map(report => (
              <div key={report.id} className="space-y-2">
                <p className="text-xs font-medium text-slate-500 truncate">
                  {report.query || report.summary.slice(0, 50)}
                </p>

                {/* Top Pros */}
                {report.topPros.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-green-600 font-medium">{zh ? '优势' : 'Pros'}</p>
                    {report.topPros.map(pro => {
                      const key = `pro-${report.id}-${pro.rank}`;
                      return (
                        <button
                          key={key}
                          onClick={() => toggleItem(key)}
                          className={cn(
                            'w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-md text-xs transition-all',
                            selectedItems.has(key) ? 'bg-green-50 border border-green-200' : 'hover:bg-slate-50 border border-transparent'
                          )}
                        >
                          <div className={cn('w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center mt-0.5',
                            selectedItems.has(key) ? 'bg-green-500 border-green-500' : 'border-slate-300'
                          )}>
                            {selectedItems.has(key) && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{pro.topic}</span>
                            <span className="text-slate-400 ml-1">({pro.mentionRate})</span>
                            <p className="text-slate-500 mt-0.5 truncate">{pro.finding}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Top Cons */}
                {report.topCons.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-red-500 font-medium">{zh ? '劣势' : 'Cons'}</p>
                    {report.topCons.map(con => {
                      const key = `con-${report.id}-${con.rank}`;
                      return (
                        <button
                          key={key}
                          onClick={() => toggleItem(key)}
                          className={cn(
                            'w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-md text-xs transition-all',
                            selectedItems.has(key) ? 'bg-red-50 border border-red-200' : 'hover:bg-slate-50 border border-transparent'
                          )}
                        >
                          <div className={cn('w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center mt-0.5',
                            selectedItems.has(key) ? 'bg-red-500 border-red-500' : 'border-slate-300'
                          )}>
                            {selectedItems.has(key) && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{con.topic}</span>
                            <span className="text-slate-400 ml-1">({con.mentionRate})</span>
                            <p className="text-slate-500 mt-0.5 truncate">{con.finding}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Recommendations */}
                {report.recommendations.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-blue-500 font-medium">{zh ? 'KSP 建议' : 'KSP Suggestions'}</p>
                    {report.recommendations.map((rec, idx) => {
                      const key = `rec-${report.id}-${idx}`;
                      return (
                        <button
                          key={key}
                          onClick={() => toggleItem(key)}
                          className={cn(
                            'w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-md text-xs transition-all',
                            selectedItems.has(key) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
                          )}
                        >
                          <div className={cn('w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center mt-0.5',
                            selectedItems.has(key) ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                          )}>
                            {selectedItems.has(key) && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className="flex-1">{rec}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {reports.length > 0 && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-3">
            <span className="text-xs text-slate-400">
              {zh ? `已选 ${selectedItems.size} 条` : `${selectedItems.size} selected`}
            </span>
            <Button onClick={handleConfirm} disabled={selectedItems.size === 0} className="bg-slate-800 hover:bg-slate-900" size="sm">
              {zh ? '确认引用' : 'Confirm'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
