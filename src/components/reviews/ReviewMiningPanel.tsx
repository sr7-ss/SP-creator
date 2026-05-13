'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, FileSpreadsheet, X, Play, Loader2, ChevronDown,
  ChevronRight, AlertCircle, CheckCircle, Search, BarChart3,
  Sparkles, Lightbulb, ArrowUp, ArrowDown, Plus, Minus,
  TrendingUp, TrendingDown, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/lib/store';
import { loadSettings, getConfigForTask, getAgentConfigForTask } from '@/lib/settings';
import { parseUploadedFile, ParsedFile } from '@/lib/utils/file-parser';
import { cn } from '@/lib/utils';
import {
  ReviewItemResult,
  ReviewBatchSummary,
  ReviewSentiment,
  ReviewInsight,
  KspAdjustmentSuggestion,
  AgentProgressStep,
} from '@/types';
import { DIMENSION_LABELS } from '@/lib/ai/prompts/review-analysis';

// ─── Props ─────────────────────────────────────────────────────────

interface ReviewMiningPanelProps {
  projectId?: string;
  onKspAdjustment?: (suggestions: KspAdjustmentSuggestion[]) => void;
}

// ─── Constants ─────────────────────────────────────────────────────

const SENTIMENT_STYLES: Record<ReviewSentiment, string> = {
  positive: 'bg-green-100 text-green-700',
  negative: 'bg-red-100 text-red-700',
  neutral: 'bg-slate-100 text-slate-600',
};

const STEP_ICONS: Record<string, typeof Search> = {
  analyze_reviews: BarChart3,
  deep_dive: Search,
  cross_reference: Activity,
  ksp_suggestions: Sparkles,
};

const DIRECTION_META: Record<string, { icon: typeof ArrowUp; color: string; label: { en: string; zh: string } }> = {
  promote: { icon: ArrowUp, color: 'text-green-600', label: { en: 'Promote', zh: '提升' } },
  demote: { icon: ArrowDown, color: 'text-red-600', label: { en: 'Demote', zh: '降级' } },
  add: { icon: Plus, color: 'text-blue-600', label: { en: 'Add new', zh: '新增' } },
  keep: { icon: Minus, color: 'text-slate-500', label: { en: 'Keep', zh: '保持' } },
};

const PAGE_SIZE = 20;

const STORAGE_KEY = 'ksp-review-mining-inputs';

// ─── Component ─────────────────────────────────────────────────────

export default function ReviewMiningPanel({ projectId, onKspAdjustment }: ReviewMiningPanelProps) {
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';

  // ─── Input state ─────────────────────────────────────────
  const [file, setFile] = useState<{ parsed: ParsedFile; fileName: string } | null>(null);
  const [selectedCol, setSelectedCol] = useState<string>('');
  const [productName, setProductName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return saved.productName || '';
    } catch { return ''; }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  // Persist productName
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      saved.productName = productName;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch { /* ignore */ }
  }, [productName]);

  // ─── Agent execution state ───────────────────────────────
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AgentProgressStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Results state ───────────────────────────────────────
  const [results, setResults] = useState<{
    summary: ReviewBatchSummary;
    items: ReviewItemResult[];
    themes: ReviewInsight[];
    kspSuggestions: KspAdjustmentSuggestion[];
  } | null>(null);

  // ─── Review card filter/pagination ───────────────────────
  const [filter, setFilter] = useState<ReviewSentiment | 'all'>('all');
  const [page, setPage] = useState(0);
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);

  // ─── File handling ───────────────────────────────────────

  const handleFile = useCallback(async (f: File) => {
    setFileError(null);
    setFileLoading(true);
    try {
      const parsed = await parseUploadedFile(f);
      setFile({ parsed, fileName: f.name });
      setResults(null);
      setError(null);
    } catch {
      setFileError(zh ? '文件解析失败' : 'Failed to parse file');
    } finally {
      setFileLoading(false);
    }
  }, [zh]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  // ─── Run analysis ────────────────────────────────────────

  const canRun = file && selectedCol;

  const handleAnalyze = useCallback(async () => {
    if (!canRun || running || !file) return;

    const colIdx = file.parsed.columns.indexOf(selectedCol);
    if (colIdx < 0) return;

    const reviewTexts = file.parsed.rows
      .map(row => row[colIdx]?.trim())
      .filter(Boolean)
      .slice(0, 500);

    if (reviewTexts.length === 0) {
      setError(zh ? '选中列没有有效评论文本' : 'No valid review text in selected column');
      return;
    }

    setRunning(true);
    setSteps([]);
    setError(null);
    setResults(null);
    abortRef.current = new AbortController();

    try {
      const settings = loadSettings();

      const config = getAgentConfigForTask(settings, 'reviews');

      if (!config?.apiKey) {
        setError(zh ? '未配置 AI API Key，请在设置页添加' : 'No AI API key configured.');
        setRunning(false);
        return;
      }

      const res = await fetch('/api/ai/agent-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType: 'reviews',
          projectId: projectId || 'reviews-standalone',
          payload: {
            reviews: reviewTexts,
            productName: productName.trim() || undefined,
          },
          locale,
          aiProvider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || (zh ? '分析启动失败' : 'Failed to start analysis'));
        setRunning(false);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) { setError('No response stream'); setRunning(false); return; }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let eventType = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6));

              if (eventType === 'progress') {
                setSteps(prev => {
                  const existing = prev.findIndex(s => s.step === data.step);
                  if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = { ...data, status: 'active' as const };
                    return updated;
                  }
                  const withDone = prev.map(s =>
                    s.status === 'active' ? { ...s, status: 'done' as const } : s
                  );
                  return [...withDone, { ...data, status: 'active' as const }];
                });
              } else if (eventType === 'done') {
                setSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })));
                processResults(data);
              } else if (eventType === 'error') {
                setError(data.error || (zh ? '分析失败' : 'Analysis failed'));
                setSteps(prev => prev.map(s =>
                  s.status === 'active' ? { ...s, status: 'error' as const } : s
                ));
              }
            } catch { /* ignore parse errors */ }
            eventType = '';
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setRunning(false);
    }
  }, [canRun, running, file, selectedCol, productName, projectId, locale, zh]);

  // Also support direct API call fallback (non-agent, for when agent-stream is not ready)
  const handleDirectAnalyze = useCallback(async () => {
    if (!canRun || running || !file) return;

    const colIdx = file.parsed.columns.indexOf(selectedCol);
    if (colIdx < 0) return;

    const reviewTexts = file.parsed.rows
      .map(row => row[colIdx]?.trim())
      .filter(Boolean)
      .slice(0, 500);

    if (reviewTexts.length === 0) {
      setError(zh ? '选中列没有有效评论文本' : 'No valid review text in selected column');
      return;
    }

    setRunning(true);
    setError(null);
    setResults(null);
    setSteps([{
      step: 'analyze_reviews',
      detail: zh ? `正在分析 ${reviewTexts.length} 条评论...` : `Analyzing ${reviewTexts.length} reviews...`,
      progress: 0.3,
      status: 'active',
    }]);

    try {
      const settings = loadSettings();
      const config = getConfigForTask(settings, 'review-analysis');

      const res = await fetch('/api/ai/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId || 'reviews-standalone',
          reviews: reviewTexts,
          productName: productName.trim() || undefined,
          fileName: file.fileName,
          locale,
          aiProvider: config.provider,
          apiKey: config.apiKey || undefined,
          model: config.model || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (zh ? '分析失败' : 'Analysis failed'));
        setSteps(prev => prev.map(s => ({ ...s, status: 'error' as const })));
        return;
      }

      setSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })));

      // Build themes from dimension data
      const themes = buildThemesFromResults(data.items, data.summary);

      setResults({
        summary: data.summary,
        items: data.items,
        themes,
        kspSuggestions: [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : (zh ? '分析失败' : 'Analysis failed'));
      setSteps(prev => prev.map(s => ({ ...s, status: 'error' as const })));
    } finally {
      setRunning(false);
    }
  }, [canRun, running, file, selectedCol, productName, projectId, locale, zh]);

  const handleAbort = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  // ─── Process agent results ───────────────────────────────

  const processResults = (data: Record<string, unknown>) => {
    const summary = (data.summary || { positive: 0, negative: 0, neutral: 0, dimensions: {} }) as ReviewBatchSummary;
    const items = (data.items || []) as ReviewItemResult[];
    const themes = (data.themes || []) as ReviewInsight[];
    const kspSuggestions = (data.kspSuggestions || []) as KspAdjustmentSuggestion[];

    // If themes are empty, build from dimension summary
    const finalThemes = themes.length > 0 ? themes : buildThemesFromResults(items, summary);

    setResults({ summary, items, themes: finalThemes, kspSuggestions });

    if (kspSuggestions.length > 0) {
      onKspAdjustment?.(kspSuggestions);
    }
  };

  // ─── Build themes from results ───────────────────────────

  function buildThemesFromResults(items: ReviewItemResult[], summary: ReviewBatchSummary): ReviewInsight[] {
    const total = items.length || 1;
    return Object.entries(summary.dimensions)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([dim, count]) => {
        // Calculate sentiment breakdown for this dimension
        const dimItems = items.filter(i => i.dimensions.includes(dim));
        const negCount = dimItems.filter(i => i.sentiment === 'negative').length;
        const posCount = dimItems.filter(i => i.sentiment === 'positive').length;
        const sentiment: ReviewSentiment =
          negCount > posCount ? 'negative' : posCount > negCount ? 'positive' : 'neutral';

        return {
          theme: dim,
          sentiment,
          count,
          percentage: Math.round((count / total) * 100),
        };
      });
  }

  // ─── Filtered review items ───────────────────────────────

  const filteredItems = results
    ? (filter === 'all' ? results.items : results.items.filter(i => i.sentiment === filter))
    : [];
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const pageItems = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ═══ Input Section ═══ */}
      {!results && (
        <>
          {/* File Upload */}
          {!file && (
            <div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                  dragging
                    ? 'border-[#1e2a3a]/40 bg-[#1e2a3a]/5'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                )}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={onChange}
                  className="hidden"
                />
                {fileLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="h-8 w-8 text-slate-400 animate-pulse" />
                    <span className="text-sm text-slate-500">{zh ? '解析中...' : 'Parsing...'}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-slate-400" />
                    <span className="text-sm text-slate-600">{t('reviews.dragDrop')}</span>
                    <span className="text-[10px] text-slate-400">{t('reviews.supportedFormats')}</span>
                  </div>
                )}
              </div>
              {fileError && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
                  <X className="h-3 w-3" />
                  {fileError}
                </div>
              )}
            </div>
          )}

          {/* Column Selector + Product Name + Analyze */}
          {file && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
              {/* File info */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-[#1e2a3a]">{file.fileName}</span>
                  <span className="text-[10px] text-slate-400 ml-2">
                    {zh ? `${file.parsed.rows.length} 行` : `${file.parsed.rows.length} rows`}
                  </span>
                </div>
                <button
                  onClick={() => { setFile(null); setSelectedCol(''); }}
                  className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  {zh ? '重选文件' : 'Change file'}
                </button>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {file.parsed.columns.map((col, i) => (
                        <th key={i} className="text-left py-1.5 px-2 text-slate-500 font-medium whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {file.parsed.rows.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        {file.parsed.columns.map((_, ci) => (
                          <td key={ci} className="py-1.5 px-2 text-slate-600 max-w-[200px] truncate">
                            {row[ci] || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Column + Product Name + Button */}
              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <Select value={selectedCol} onValueChange={(val) => val && setSelectedCol(val)}>
                    <SelectTrigger className="flex-1 bg-slate-50/50 text-sm">
                      <SelectValue placeholder={t('reviews.selectColumn')} />
                    </SelectTrigger>
                    <SelectContent>
                      {file.parsed.columns.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder={zh ? '产品名称（可选，用于规格交叉对比）' : 'Product name (optional, for spec cross-reference)'}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    {selectedCol
                      ? (zh
                        ? `将分析「${selectedCol}」列的 ${file.parsed.rows.length} 条评论`
                        : `Will analyze ${file.parsed.rows.length} reviews from "${selectedCol}" column`)
                      : (zh ? '请选择评论所在列' : 'Select the column containing reviews')}
                  </span>
                  <Button
                    onClick={handleDirectAnalyze}
                    disabled={!canRun || running}
                    className="h-9 px-5 bg-[#1e2a3a] hover:bg-[#2a3a4f] rounded-lg text-sm gap-2"
                  >
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {running ? (zh ? '分析中...' : 'Analyzing...') : (zh ? '开始分析' : 'Start Analysis')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ Progress Section ═══ */}
      {steps.length > 0 && !results && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1e2a3a] rounded-full transition-all duration-500"
              style={{ width: `${Math.max(...steps.map(s => s.progress)) * 100}%` }}
            />
          </div>
          <div className="space-y-2">
            {steps.map((step, idx) => {
              const Icon = STEP_ICONS[step.step] || Search;
              return (
                <div key={idx} className="flex items-center gap-3">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center',
                    step.status === 'done' ? 'bg-green-100' :
                    step.status === 'error' ? 'bg-red-100' : 'bg-slate-100'
                  )}>
                    {step.status === 'done' ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                    ) : step.status === 'error' ? (
                      <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                    ) : (
                      <Icon className="h-3.5 w-3.5 text-slate-600 animate-pulse" />
                    )}
                  </div>
                  <span className={cn(
                    'text-xs',
                    step.status === 'done' ? 'text-green-700' :
                    step.status === 'error' ? 'text-red-600' : 'text-slate-700 font-medium'
                  )}>
                    {step.detail}
                  </span>
                </div>
              );
            })}
          </div>
          {running && (
            <button
              onClick={handleAbort}
              className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
            >
              {zh ? '取消' : 'Cancel'}
            </button>
          )}
        </div>
      )}

      {/* ═══ Error ═══ */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* ═══ Results Section ═══ */}
      {results && (
        <div className="space-y-5">
          {/* Summary Cards */}
          <div className="space-y-3">
            <h3 className="font-syne text-lg font-bold text-[#1e2a3a]">{t('reviews.summary')}</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t('reviews.positive'), count: results.summary.positive, color: 'bg-green-50 text-green-700', accent: 'bg-green-500', icon: TrendingUp },
                { label: t('reviews.negative'), count: results.summary.negative, color: 'bg-red-50 text-red-700', accent: 'bg-red-500', icon: TrendingDown },
                { label: t('reviews.neutral'), count: results.summary.neutral, color: 'bg-slate-50 text-slate-600', accent: 'bg-slate-400', icon: Activity },
              ].map(({ label, count, color, accent, icon: CardIcon }) => {
                const total = results.items.length || 1;
                return (
                  <div key={label} className={cn('rounded-xl p-4', color)}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn('w-2 h-2 rounded-full', accent)} />
                      <span className="text-[11px] font-medium">{label}</span>
                      <CardIcon className="h-3 w-3 opacity-40 ml-auto" />
                    </div>
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-[10px] opacity-60">
                      {Math.round((count / total) * 100)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Themes */}
          {results.themes.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-syne text-lg font-bold text-[#1e2a3a]">
                {zh ? '主要主题' : 'Top Themes'}
              </h3>
              <div className="space-y-2">
                {results.themes.map((theme) => {
                  const label = DIMENSION_LABELS[theme.theme as keyof typeof DIMENSION_LABELS];
                  const displayName = label ? (zh ? label.zh : label.en) : theme.theme;
                  const isExpanded = expandedTheme === theme.theme;

                  return (
                    <div
                      key={theme.theme}
                      className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                    >
                      <button
                        onClick={() => setExpandedTheme(isExpanded ? null : theme.theme)}
                        className="w-full flex items-center gap-3 p-4 hover:bg-slate-50/50 transition-colors text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <span className="text-sm font-medium text-[#1e2a3a] flex-1">
                          {displayName}
                        </span>
                        <Badge className={cn('text-[10px]', SENTIMENT_STYLES[theme.sentiment])}>
                          {theme.sentiment}
                        </Badge>
                        <span className="text-[10px] text-slate-400">
                          {theme.count} ({theme.percentage}%)
                        </span>

                        {/* Sentiment bar */}
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              theme.sentiment === 'negative' ? 'bg-red-400' :
                              theme.sentiment === 'positive' ? 'bg-green-400' : 'bg-slate-300'
                            )}
                            style={{ width: `${theme.percentage}%` }}
                          />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 border-t border-slate-100 space-y-2">
                          {theme.rootCause && (
                            <div className="text-xs text-slate-600">
                              <span className="font-medium text-slate-500">
                                {zh ? '根因：' : 'Root cause: '}
                              </span>
                              {theme.rootCause}
                            </div>
                          )}
                          {theme.subThemes && theme.subThemes.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {theme.subThemes.map((st, i) => (
                                <span
                                  key={i}
                                  className="text-[9px] px-2 py-0.5 rounded-full bg-[#1e2a3a]/8 text-[#1e2a3a]/70"
                                >
                                  {st}
                                </span>
                              ))}
                            </div>
                          )}
                          {theme.severity && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500">{zh ? '严重程度' : 'Severity'}:</span>
                              <Badge className={cn(
                                'text-[9px]',
                                theme.severity === 'high' ? 'bg-red-100 text-red-700' :
                                theme.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                                'bg-green-100 text-green-700'
                              )}>
                                {theme.severity}
                              </Badge>
                            </div>
                          )}
                          {theme.actionableInsight && (
                            <div className="flex items-start gap-2 bg-amber-50/50 rounded-lg p-2">
                              <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                              <span className="text-xs text-amber-800">{theme.actionableInsight}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dimension Distribution */}
          {Object.keys(results.summary.dimensions).length > 0 && (
            <div className="space-y-3">
              <h3 className="font-syne text-lg font-bold text-[#1e2a3a]">{t('reviews.dimensions')}</h3>
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5">
                {Object.entries(results.summary.dimensions)
                  .sort(([, a], [, b]) => b - a)
                  .map(([dim, count]) => {
                    const label = DIMENSION_LABELS[dim as keyof typeof DIMENSION_LABELS];
                    const displayName = label ? (zh ? label.zh : label.en) : dim;
                    const maxCount = Math.max(...Object.values(results.summary.dimensions));
                    const pct = results.items.length > 0 ? Math.round((count / results.items.length) * 100) : 0;
                    const barWidth = Math.round((count / (maxCount || 1)) * 100);

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
          )}

          {/* KSP Adjustment Suggestions */}
          {results.kspSuggestions.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-syne text-lg font-bold text-[#1e2a3a]">
                {zh ? 'KSP 调整建议' : 'KSP Adjustment Suggestions'}
              </h3>
              <div className="space-y-2">
                {results.kspSuggestions.map((suggestion) => {
                  const meta = DIRECTION_META[suggestion.direction] || DIRECTION_META.keep;
                  const DirIcon = meta.icon;
                  return (
                    <div
                      key={suggestion.id}
                      className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3"
                    >
                      <div className={cn('mt-0.5', meta.color)}>
                        <DirIcon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-[#1e2a3a]">
                            {suggestion.featureName}
                          </span>
                          <span className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded font-medium',
                            suggestion.direction === 'promote' ? 'bg-green-50 text-green-600' :
                            suggestion.direction === 'demote' ? 'bg-red-50 text-red-600' :
                            suggestion.direction === 'add' ? 'bg-blue-50 text-blue-600' :
                            'bg-slate-50 text-slate-500'
                          )}>
                            {zh ? meta.label.zh : meta.label.en}
                          </span>
                          {suggestion.currentTier && (
                            <span className="text-[10px] text-slate-400">
                              T{suggestion.currentTier} → T{suggestion.suggestedTier}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">{suggestion.reason}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#1e2a3a]/40 rounded-full"
                              style={{ width: `${suggestion.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-slate-400">
                            {Math.round(suggestion.confidence * 100)}% {zh ? '置信度' : 'confidence'}
                          </span>
                        </div>
                      </div>
                      {projectId && onKspAdjustment && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onKspAdjustment([suggestion])}
                          className="h-7 text-[10px] px-3 shrink-0"
                        >
                          {zh ? '应用' : 'Apply'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Review Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-syne text-lg font-bold text-[#1e2a3a]">{t('reviews.reviewCards')}</h3>
              <span className="text-[10px] text-slate-400">
                {filteredItems.length} / {results.items.length}
              </span>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1.5">
              {([
                { key: 'all' as const, label: t('reviews.all') },
                { key: 'positive' as const, label: t('reviews.positive') },
                { key: 'negative' as const, label: t('reviews.negative') },
                { key: 'neutral' as const, label: t('reviews.neutral') },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setFilter(tab.key); setPage(0); }}
                  className={cn(
                    'text-[11px] px-3 py-1.5 rounded-lg transition-colors',
                    filter === tab.key
                      ? 'bg-[#1e2a3a] text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  )}
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
                    <Badge className={cn('shrink-0 text-[10px]', SENTIMENT_STYLES[item.sentiment])}>
                      {item.sentiment}
                    </Badge>
                  </div>
                  {item.dimensions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {item.dimensions.map(dim => {
                        const label = DIMENSION_LABELS[dim as keyof typeof DIMENSION_LABELS];
                        return (
                          <span
                            key={dim}
                            className="text-[9px] px-2 py-0.5 rounded-full bg-[#1e2a3a]/8 text-[#1e2a3a]/70"
                          >
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
                  <ChevronDown className="h-4 w-4 rotate-90" />
                </button>
                <span className="text-xs text-slate-500">{page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4 -rotate-90" />
                </button>
              </div>
            )}
          </div>

          {/* Reset */}
          <button
            onClick={() => {
              setFile(null);
              setResults(null);
              setError(null);
              setSteps([]);
              setSelectedCol('');
              setFilter('all');
              setPage(0);
            }}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {zh ? '重新上传' : 'Upload another file'}
          </button>
        </div>
      )}

      {/* ═══ Empty State ═══ */}
      {!file && !results && !running && (
        <div className="text-center py-8 text-slate-400 text-sm">
          {t('reviews.noResults')}
        </div>
      )}
    </div>
  );
}
