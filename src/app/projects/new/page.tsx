'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/lib/store';
import { track } from '@/lib/analytics/track';

function NewProjectForm() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState('');
  const [market, setMarket] = useState('');
  const [segment, setSegment] = useState('');
  const [launchDate, setLaunchDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const marketParam = searchParams.get('market');
    if (marketParam) setMarket(decodeURIComponent(marketParam));
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          market: market.trim() || undefined,
          segment: segment.trim() || undefined,
          launchDate: launchDate || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to create project');

      const project = await res.json();
      track('project_created', { hasMarket: !!market.trim(), hasSegment: !!segment.trim() });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
      setSubmitting(false);
    }
  };

  const backHref = market ? `/regions/${encodeURIComponent(market)}` : '/regions';

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Back link */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {market || (locale === 'zh' ? '所属战区' : 'Regions')}
      </Link>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">
            {t('project.create')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-700">
                {t('project.name')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('project.name')}
                required
                autoFocus
                className="bg-slate-50/50 focus-visible:ring-slate-300"
              />
            </div>

            {/* Market */}
            <div className="space-y-2">
              <Label htmlFor="market" className="text-slate-700">
                {t('project.market')}
              </Label>
              <Input
                id="market"
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                placeholder={t('project.market')}
                className="bg-slate-50/50 focus-visible:ring-slate-300"
              />
            </div>

            {/* Segment */}
            <div className="space-y-2">
              <Label htmlFor="segment" className="text-slate-700">
                {t('project.segment')}
              </Label>
              <Input
                id="segment"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                placeholder={t('project.segment')}
                className="bg-slate-50/50 focus-visible:ring-slate-300"
              />
            </div>

            {/* Launch Date */}
            <div className="space-y-2">
              <Label htmlFor="launchDate" className="text-slate-700">
                {locale === 'zh' ? '上市时间' : 'Launch Date'}
                <span className="text-slate-400 text-xs ml-1">({locale === 'zh' ? '选填' : 'optional'})</span>
              </Label>
              <Input
                id="launchDate"
                type="date"
                value={launchDate}
                onChange={(e) => setLaunchDate(e.target.value)}
                className="bg-slate-50/50 focus-visible:ring-slate-300"
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-2">
              <Link href={backHref}>
                <Button type="button" variant="outline">
                  {t('common.cancel')}
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={!name.trim() || submitting}
                className="bg-slate-800 hover:bg-slate-900 shadow-sm"
              >
                {submitting ? t('common.loading') : t('project.create')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense>
      <NewProjectForm />
    </Suspense>
  );
}
