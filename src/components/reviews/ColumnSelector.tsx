'use client';

import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/lib/store';

interface ColumnSelectorProps {
  columns: string[];
  rows: string[][];
  fileName: string;
  loading: boolean;
  onAnalyze: (reviewTexts: string[]) => void;
}

export default function ColumnSelector({ columns, rows, fileName, loading, onAnalyze }: ColumnSelectorProps) {
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';
  const [selectedCol, setSelectedCol] = useState<string>('');

  const handleAnalyze = () => {
    const colIdx = columns.indexOf(selectedCol);
    if (colIdx < 0) return;
    const texts = rows
      .map(row => row[colIdx]?.trim())
      .filter(Boolean);
    onAnalyze(texts);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-[#1e2a3a]">{fileName}</span>
          <span className="text-[10px] text-slate-400 ml-2">
            {zh ? `${rows.length} 行` : `${rows.length} rows`}
          </span>
        </div>
      </div>

      {/* Preview first 3 rows */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-slate-100">
              {columns.map((col, i) => (
                <th key={i} className="text-left py-1.5 px-2 text-slate-500 font-medium whitespace-nowrap">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 3).map((row, i) => (
              <tr key={i} className="border-b border-slate-50">
                {columns.map((_, ci) => (
                  <td key={ci} className="py-1.5 px-2 text-slate-600 max-w-[200px] truncate">{row[ci] || ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Column selector + Analyze button */}
      <div className="flex gap-2 items-center">
        <Select value={selectedCol} onValueChange={(val) => val && setSelectedCol(val)}>
          <SelectTrigger className="flex-1 bg-slate-50/50 text-sm">
            <SelectValue placeholder={t('reviews.selectColumn')} />
          </SelectTrigger>
          <SelectContent>
            {columns.map(col => (
              <SelectItem key={col} value={col}>{col}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={handleAnalyze}
          disabled={!selectedCol || loading}
          className="h-9 px-5 bg-[#1e2a3a] hover:bg-[#2a3a4f] rounded-lg text-sm gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {loading ? t('reviews.analyzing') : t('reviews.analyze')}
        </Button>
      </div>
    </div>
  );
}
