'use client';

import { useTranslation } from '@/lib/store';
import { DIMENSION_LABELS } from '@/lib/ai/prompts/review-analysis';

interface DimensionChartProps {
  dimensions: Record<string, number>;
  total: number;
}

export default function DimensionChart({ dimensions, total }: DimensionChartProps) {
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';

  const sorted = Object.entries(dimensions)
    .sort(([, a], [, b]) => b - a);

  if (sorted.length === 0) return null;

  const maxCount = sorted[0]?.[1] || 1;

  return (
    <div className="space-y-3">
      <h3 className="font-syne text-lg font-bold text-[#1e2a3a]">{t('reviews.dimensions')}</h3>
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5">
        {sorted.map(([dim, count]) => {
          const label = DIMENSION_LABELS[dim as keyof typeof DIMENSION_LABELS];
          const displayName = label ? (zh ? label.zh : label.en) : dim;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const barWidth = Math.round((count / maxCount) * 100);

          return (
            <div key={dim} className="flex items-center gap-3">
              <span className="text-[11px] text-slate-600 w-[90px] shrink-0 text-right">
                {displayName}
              </span>
              <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1e2a3a]/70 rounded-full transition-all duration-500"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 w-[50px] shrink-0">
                {count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
