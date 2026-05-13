'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, Loader2, ExternalLink, AlertCircle, Check, Plus, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useTranslation } from '@/lib/store';
import { PARAM_CATEGORIES } from '@/lib/constants/param-weights';

interface CompetitorSearchProps {
  onParsed: (products: { name: string; isOwnProduct: boolean; params: Record<string, string>; sourceUrl?: string }[]) => void;
  market?: string;
}

interface SearchResult {
  specs: Record<string, string>;
  source: string;
  sourceUrl: string;
  foundCount: number;
  totalCount: number;
  missingFields?: string[];
  sufficient: boolean;
  fallbackLinks?: { name: string; url: string }[];
}

export default function CompetitorSearch({ onParsed, market }: CompetitorSearchProps) {
  const { locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Progress steps while searching
  const SEARCH_SOURCES = ['GSMArena', '91mobiles', 'CellKaro', 'TechSpecs.info'];
  const [progressIdx, setProgressIdx] = useState(-1);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);


  // Clean up progress timer
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  const handleSearch = useCallback(async () => {
    if (!deviceName.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setProgressIdx(0);

    // Animate progress through sources (backend checks them sequentially)
    let step = 0;
    progressTimerRef.current = setInterval(() => {
      step++;
      if (step < SEARCH_SOURCES.length) {
        setProgressIdx(step);
      } else {
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      }
    }, 2500); // ~2.5s per source matches server timeout of 8s/source

    try {
      const res = await fetch('/api/competitor-specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName: deviceName.trim(), market }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Search failed');
        return;
      }

      setResult(data);
    } catch {
      setError(locale === 'zh' ? '搜索失败，请检查网络连接' : 'Search failed');
    } finally {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      setProgressIdx(-1);
      setLoading(false);
    }
  }, [deviceName, market, locale]);

  const handleAdd = useCallback(() => {
    if (!result) return;
    onParsed([{ name: deviceName.trim(), isOwnProduct: false, params: result.specs, sourceUrl: result.sourceUrl || undefined }]);
    setOpen(false);
    handleFullReset();
  }, [result, deviceName, onParsed]);

  const handleAddEmpty = useCallback(() => {
    onParsed([{ name: deviceName.trim(), isOwnProduct: false, params: {} }]);
    setOpen(false);
    handleFullReset();
  }, [deviceName, onParsed]);

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  const handleFullReset = () => {
    handleReset();
    setDeviceName('');
  };


  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) handleReset(); }}>
      <DialogTrigger className="inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-800 text-white px-3 py-1.5 text-xs font-medium hover:bg-slate-700 transition-colors">
        <Search className="h-3.5 w-3.5" />
        {locale === 'zh' ? '竞品抓取' : 'Fetch Competitor'}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {locale === 'zh' ? '搜索竞品参数' : 'Search Competitor Specs'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Search input */}
          <div className="flex gap-2">
            <Input
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              placeholder={locale === 'zh' ? 'vivo T4x' : 'vivo T4x'}
              className="text-sm h-8 flex-1"
              disabled={loading}
              autoFocus
            />
            <Button
              onClick={handleSearch}
              disabled={loading || !deviceName.trim()}
              size="sm"
              className="h-8 min-w-[120px] bg-slate-800 hover:bg-slate-700"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />{locale === 'zh' ? '搜索中...' : 'Searching...'}</>
              ) : (
                <><Search className="h-4 w-4 mr-1.5" />{locale === 'zh' ? '搜索' : 'Search'}</>
              )}
            </Button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Progress steps */}
          {loading && progressIdx >= 0 && (
            <div className="space-y-1.5 p-3 bg-slate-50 rounded-lg">
              {SEARCH_SOURCES.map((src, idx) => (
                <div key={src} className="flex items-center gap-2 text-xs">
                  {idx < progressIdx ? (
                    <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  ) : idx === progressIdx ? (
                    <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
                  ) : (
                    <Globe className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                  )}
                  <span className={idx <= progressIdx ? 'text-slate-700' : 'text-slate-400'}>
                    {idx === progressIdx
                      ? (locale === 'zh' ? `正在搜索 ${src}...` : `Searching ${src}...`)
                      : idx < progressIdx
                        ? (locale === 'zh' ? `${src} 已完成` : `${src} done`)
                        : src}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              {/* Summary — green if sufficient, amber if not */}
              <div className={`flex items-center justify-between p-3 rounded-lg ${
                result.sufficient ? 'bg-green-50' : result.foundCount > 0 ? 'bg-amber-50' : 'bg-red-50'
              }`}>
                <div className="flex items-center gap-2">
                  {result.sufficient ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  )}
                  <span className={`text-xs font-medium ${
                    result.sufficient ? 'text-green-700' : result.foundCount > 0 ? 'text-amber-700' : 'text-red-700'
                  }`}>
                    {locale === 'zh'
                      ? result.foundCount > 0
                        ? `已找到 ${result.foundCount}/${result.totalCount} 项参数${!result.sufficient ? '（数据不完整）' : ''}`
                        : '未能自动获取参数'
                      : result.foundCount > 0
                        ? `Found ${result.foundCount}/${result.totalCount} params${!result.sufficient ? ' (incomplete)' : ''}`
                        : 'Could not auto-fetch specs'}
                  </span>
                </div>
                {result.sourceUrl && (
                  <a
                    href={result.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700"
                  >
                    {result.source}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {/* Preview of found params (only if we have some) */}
              {result.foundCount > 0 && (
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs">
                    <tbody>
                      {Object.entries(result.specs).map(([key, value]) => {
                        const field = PARAM_CATEGORIES
                          .flatMap(c => c.fields)
                          .find(f => f.key === key);
                        return (
                          <tr key={key} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-1.5 text-slate-500 w-28">
                              {field ? (locale === 'zh' ? field.nameZh : field.nameEn) : key}
                            </td>
                            <td className="px-3 py-1.5 text-slate-800">{value}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Fallback: links + inline paste area — shown when any fields missing */}
              {result.missingFields && result.missingFields.length > 0 && (
                <div className="space-y-3">
                  {/* Links */}
                  {result.fallbackLinks && result.fallbackLinks.length > 0 && (
                    <div className="flex flex-row gap-2 flex-wrap">
                      {result.fallbackLinks.map(link => (
                        <a
                          key={link.name}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-md px-2.5 py-1.5 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3 text-slate-400" />
                          {link.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Missing fields hint */}
              {result.missingFields && result.missingFields.length > 0 && result.foundCount > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-[10px] text-slate-400">
                    {locale === 'zh' ? '缺失:' : 'Missing:'}
                  </span>
                  {result.missingFields.slice(0, 8).map(key => {
                    const field = PARAM_CATEGORIES
                      .flatMap(c => c.fields)
                      .find(f => f.key === key);
                    return (
                      <span key={key} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                        {field ? (locale === 'zh' ? field.nameZh : field.nameEn) : key}
                      </span>
                    );
                  })}
                  {result.missingFields.length > 8 && (
                    <span className="text-[10px] text-slate-400">+{result.missingFields.length - 8}</span>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex justify-between">
                <Button variant="outline" size="sm" onClick={handleReset} className="text-xs">
                  {locale === 'zh' ? '重新搜索' : 'Search Again'}
                </Button>
                <div className="flex gap-2">
                  {result.foundCount === 0 && (
                    <Button variant="outline" size="sm" onClick={handleAddEmpty} className="text-xs gap-1">
                      <Plus className="h-3 w-3" />
                      {locale === 'zh' ? '添加空列' : 'Add Empty'}
                    </Button>
                  )}
                  {result.foundCount > 0 && (
                    <Button
                      size="sm"
                      onClick={handleAdd}
                      className="text-xs bg-slate-800 hover:bg-slate-700"
                    >
                      {locale === 'zh'
                        ? `添加到表格（${result.foundCount}项）`
                        : `Add to Table (${result.foundCount})`}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
