'use client';

import { useTranslation } from '@/lib/store';
import { ReviewBatchSummary } from '@/types';

interface ResultsSummaryProps {
  summary: ReviewBatchSummary;
  total: number;
}

export default function ResultsSummary({ summary, total }: ResultsSummaryProps) {
  const { t } = useTranslation();

  const cards = [
    { label: t('reviews.positive'), count: summary.positive, color: 'bg-green-50 text-green-700', accent: 'bg-green-500' },
    { label: t('reviews.negative'), count: summary.negative, color: 'bg-red-50 text-red-700', accent: 'bg-red-500' },
    { label: t('reviews.neutral'), count: summary.neutral, color: 'bg-slate-50 text-slate-600', accent: 'bg-slate-400' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="font-syne text-lg font-bold text-[#1e2a3a]">{t('reviews.summary')}</h3>
      <div className="grid grid-cols-3 gap-3">
        {cards.map(({ label, count, color, accent }) => (
          <div key={label} className={`rounded-xl p-4 ${color}`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${accent}`} />
              <span className="text-[11px] font-medium">{label}</span>
            </div>
            <div className="text-2xl font-bold">{count}</div>
            <div className="text-[10px] opacity-60">
              {total > 0 ? `${Math.round((count / total) * 100)}%` : '0%'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
