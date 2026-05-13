'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/store';
import { ReviewItemResult, ReviewSentiment } from '@/types';
import { DIMENSION_LABELS } from '@/lib/ai/prompts/review-analysis';

interface ReviewCardListProps {
  items: ReviewItemResult[];
}

const SENTIMENT_STYLES: Record<ReviewSentiment, string> = {
  positive: 'bg-green-100 text-green-700',
  negative: 'bg-red-100 text-red-700',
  neutral: 'bg-slate-100 text-slate-600',
};

const PAGE_SIZE = 20;

export default function ReviewCardList({ items }: ReviewCardListProps) {
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';
  const [filter, setFilter] = useState<ReviewSentiment | 'all'>('all');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter(i => i.sentiment === filter);
  }, [items, filter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const tabs: { key: ReviewSentiment | 'all'; label: string }[] = [
    { key: 'all', label: t('reviews.all') },
    { key: 'positive', label: t('reviews.positive') },
    { key: 'negative', label: t('reviews.negative') },
    { key: 'neutral', label: t('reviews.neutral') },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-syne text-lg font-bold text-[#1e2a3a]">{t('reviews.reviewCards')}</h3>
        <span className="text-[10px] text-slate-400">{filtered.length} / {items.length}</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setFilter(tab.key); setPage(0); }}
            className={`text-[11px] px-3 py-1.5 rounded-lg transition-colors ${
              filter === tab.key
                ? 'bg-[#1e2a3a] text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {pageItems.map((item, idx) => (
          <div key={page * PAGE_SIZE + idx} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm text-slate-700 flex-1 line-clamp-3">{item.text}</p>
              <Badge className={`shrink-0 text-[10px] ${SENTIMENT_STYLES[item.sentiment]}`}>
                {item.sentiment}
              </Badge>
            </div>
            {item.dimensions.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {item.dimensions.map(dim => {
                  const label = DIMENSION_LABELS[dim as keyof typeof DIMENSION_LABELS];
                  return (
                    <span key={dim} className="text-[9px] px-2 py-0.5 rounded-full bg-[#1e2a3a]/8 text-[#1e2a3a]/70">
                      {label ? (zh ? label.zh : label.en) : dim}
                    </span>
                  );
                })}
              </div>
            )}
            {item.highlights.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.highlights.map((h, i) => (
                  <span key={i} className="text-[9px] text-slate-400 italic">&quot;{h}&quot;</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-slate-500">{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
