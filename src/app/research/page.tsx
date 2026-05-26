'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Search, Loader2, FileText, ChevronDown, ChevronRight, TrendingUp, AlertTriangle, CheckCircle2, ExternalLink, FolderOpen, Clock, ArrowRight, Plus, Clipboard, Table, ArrowUp, X, ImageIcon, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ResearchReport, ResearchMention } from '@/types';
import { useTranslation } from '@/lib/store';
import { cn } from '@/lib/utils';
import { cachedFetch } from '@/lib/utils/fetch-cache';
import AgentProgressPanel from '@/components/agent/AgentProgressPanel';
import { useAgentStream } from '@/lib/useAgentStream';

// ─── Types ──────────────────────────────────────────────────

interface ProjectOption {
  id: string;
  name: string;
  segment?: string;
  market?: string;
}

interface SavedReport {
  id: string;
  projectId: string;
  query: string;
  summary: string;
  insights: ResearchMention[] | null;
  topPros: ResearchMention[] | null;
  topCons: ResearchMention[] | null;
  messaging: { competitor: string; feature: string; messaging: string }[] | null;
  recommendations: string[] | null;
  sources: { url: string; type: string; snippetCount: number }[] | null;
  createdAt: string;
  project: { id: string; name: string; segment?: string; market?: string };
}

// ─── Prompt templates ───────────────────────────────────────

const QUICK_PROMPTS_ZH = [
  { label: '用户评论分析', prompt: '搜索{product}在{market}电商平台的用户评论，分析用户最关注的功能和痛点，并排序总结' },
  { label: '竞品卖点对比', prompt: '搜索{product}竞品在{market}的卖点宣传话术，对比各家的核心差异和营销策略' },
  { label: '价位段趋势', prompt: '研究{market}{segment}价位段的用户需求趋势，哪些卖点最受关注，消费者购买决策因素排序' },
  { label: '全面调研', prompt: '对{product}做{market}全面市场调研：用户评论分析、竞品话术对比、市场趋势，产出完整报告并排序总结' },
];

const QUICK_PROMPTS_EN = [
  { label: 'User Reviews', prompt: 'Search user reviews for {product} on {market} e-commerce platforms, analyze top concerns and pain points, rank by frequency' },
  { label: 'Competitor Messaging', prompt: 'Search how {product} competitors market their selling points in {market}, compare core differences and strategies' },
  { label: 'Segment Trends', prompt: 'Research user demand trends in the {segment} segment in {market}, which features matter most, rank purchase decision factors' },
  { label: 'Full Research', prompt: 'Do comprehensive {market} market research for {product}: user reviews, competitor messaging, market trends, produce ranked summary' },
];

// ─── Sub-components ─────────────────────────────────────────

/** Compact mention row with frequency bar + expandable quotes */
function MentionRow({ item, type }: { item: ResearchMention; type: 'pro' | 'con' }) {
  const [expanded, setExpanded] = useState(false);
  const isPro = type === 'pro';

  // Parse mentionRate — supports "8/12" (N/M) or "68%" formats
  let barWidth = 10;
  const fracMatch = item.mentionRate.match(/(\d+)\s*\/\s*(\d+)/);
  if (fracMatch) {
    const n = parseInt(fracMatch[1]), m = parseInt(fracMatch[2]);
    barWidth = m > 0 ? Math.min(Math.max(Math.round((n / m) * 100), 10), 100) : 10;
  } else {
    const pct = parseInt(item.mentionRate) || 0;
    barWidth = Math.min(Math.max(pct, 10), 100);
  }

  return (
    <div className="group">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
      >
        <span className={cn('text-[11px] font-bold w-4 flex-shrink-0', isPro ? 'text-green-600' : 'text-red-500')}>{item.rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-800 truncate">{item.topic}</span>
            <span className={cn('text-[10px] font-semibold flex-shrink-0', isPro ? 'text-green-600' : 'text-red-500')}>{item.mentionRate}</span>
          </div>
          {/* Frequency bar */}
          <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', isPro ? 'bg-green-400' : 'bg-red-400')}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
        <ChevronRight className={cn('h-3 w-3 text-slate-300 transition-transform flex-shrink-0', expanded && 'rotate-90')} />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="ml-6 pb-2 space-y-1">
          <p className="text-[11px] text-slate-600">{item.finding}</p>
          {item.quotes && item.quotes.length > 0 && (
            <div className={cn('space-y-0.5 border-l-2 pl-2', isPro ? 'border-green-200' : 'border-red-200')}>
              {item.quotes.map((q, i) => (
                <p key={i} className="text-[10px] text-slate-400 italic">&ldquo;{q}&rdquo;</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Report Card ────────────────────────────────────────────

function MentionList({ items, type, zh }: { items: ResearchMention[]; type: 'pro' | 'con'; zh: boolean }) {
  const isPro = type === 'pro';
  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className={cn('border rounded-lg overflow-hidden', isPro ? 'border-green-100' : 'border-red-100')}>
          <div className={cn('flex items-center gap-2 px-3 py-1.5', isPro ? 'bg-green-50/50' : 'bg-red-50/50')}>
            <span className={cn('text-xs font-bold w-4', isPro ? 'text-green-700' : 'text-red-600')}>{item.rank}.</span>
            <span className="text-xs font-medium text-slate-700 flex-1">{item.topic}</span>
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', isPro ? 'text-green-600 bg-green-100' : 'text-red-500 bg-red-100')}>{item.mentionRate}</span>
          </div>
          <div className="px-3 py-2">
            <p className="text-[11px] text-slate-600">{item.finding}</p>
            {item.quotes && item.quotes.length > 0 && (
              <div className={cn('mt-1.5 space-y-1 border-l-2 pl-2.5', isPro ? 'border-green-200' : 'border-red-200')}>
                {item.quotes.map((q, i) => (
                  <p key={i} className="text-[10px] text-slate-500 italic">&ldquo;{q}&rdquo;</p>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportCard({ report, zh }: { report: SavedReport; zh: boolean }) {
  const [expanded, setExpanded] = useState(false);

  // Support both new (topPros/topCons) and legacy (insights) format
  const topPros = report.topPros || [];
  const topCons = report.topCons || [];

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50/50 text-left transition-colors"
      >
        <div className="mt-0.5">
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] flex-shrink-0">{report.project.name}</Badge>
            <span className="text-[10px] text-slate-400">
              {new Date(report.createdAt).toLocaleDateString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs font-medium text-slate-700 line-clamp-1">{report.query}</p>
          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{report.summary}</p>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100">
          <div className="pt-3">
            <p className="text-sm text-slate-600 leading-relaxed">{report.summary}</p>
          </div>

          {/* Top Pros */}
          {topPros.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                <p className="text-xs font-medium text-slate-500">{zh ? '用户最多提及的优点' : 'Top Pros'}</p>
              </div>
              <MentionList items={topPros} type="pro" zh={zh} />
            </div>
          )}

          {/* Top Cons */}
          {topCons.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <p className="text-xs font-medium text-slate-500">{zh ? '用户最多提及的缺点' : 'Top Cons'}</p>
              </div>
              <MentionList items={topCons} type="con" zh={zh} />
            </div>
          )}

          {/* Competitor messaging */}
          {report.messaging && report.messaging.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                {zh ? '竞品话术' : 'Competitor Messaging'}
              </p>
              <div className="space-y-1.5">
                {report.messaging.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2">
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">{item.competitor}</Badge>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-slate-600">{item.feature}:</span>
                      <span className="text-slate-500 ml-1">{item.messaging}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SP recommendations */}
          {report.recommendations && report.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                {zh ? 'SP 建议' : 'SP Recommendations'}
              </p>
              <div className="space-y-1.5">
                {report.recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs">
                    <span className="text-green-500 mt-0.5 font-bold">&gt;</span>
                    <p className="text-slate-600">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sources */}
          {report.sources && report.sources.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 mb-1">{zh ? '数据来源' : 'Sources'} ({report.sources.length})</p>
              <div className="flex flex-wrap gap-1">
                {report.sources.map((s, idx) => (
                  <a key={idx} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 hover:text-blue-600 flex items-center gap-0.5">
                    <ExternalLink className="h-2.5 w-2.5" />
                    {(() => { try { return new URL(s.url).hostname.replace('www.', ''); } catch { return s.type; } })()}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100">
            <Link
              href={`/projects/${report.projectId}`}
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <ArrowRight className="h-3 w-3" />
              {zh ? `前往项目「${report.project.name}」开始工作` : `Go to "${report.project.name}" to start working`}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function ResearchPage() {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  // ─── State ──────────────────────────────────────────────
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [savingReport, setSavingReport] = useState(false);
  const [latestReport, setLatestReport] = useState<{
    summary: string;
    topPros: { rank: number; topic: string; mentionRate: string; finding: string; quotes: string[] }[];
    topCons: { rank: number; topic: string; mentionRate: string; finding: string; quotes: string[] }[];
    messaging: { competitor: string; feature: string; messaging: string }[];
    recommendations: string[];
    sources: { url: string; type: string; snippetCount: number }[];
  } | null>(null);
  const [attachments, setAttachments] = useState<{ id: string; name: string; type: string; preview?: string; file?: File }[]>([]);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const quickPrompts = zh ? QUICK_PROMPTS_ZH : QUICK_PROMPTS_EN;

  // ─── Auto-grow textarea ────────────────────────────────
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(Math.max(el.scrollHeight, 80), 200) + 'px';
  }, []);

  // ─── File handlers ─────────────────────────────────────
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;
    const newAttachments = Array.from(files).map(file => {
      const att: { id: string; name: string; type: string; preview?: string; file?: File } = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'file',
        file,
      };
      if (file.type.startsWith('image/')) {
        att.preview = URL.createObjectURL(file);
      }
      return att;
    });
    setAttachments(prev => [...prev, ...newAttachments]);
    setShowPlusMenu(false);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att?.preview) URL.revokeObjectURL(att.preview);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        // Try image
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const preview = URL.createObjectURL(blob);
          setAttachments(prev => [...prev, {
            id: `att-${Date.now()}`,
            name: zh ? '剪贴板图片' : 'Clipboard image',
            type: 'image',
            preview,
          }]);
          return;
        }
        // Try text
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain');
          const text = await blob.text();
          setPrompt(prev => prev + text);
          setTimeout(autoGrow, 0);
          return;
        }
      }
    } catch {
      // Fallback: read text
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          setPrompt(prev => prev + text);
          setTimeout(autoGrow, 0);
        }
      } catch { /* ignore */ }
    }
  }, [zh, autoGrow]);

  // ─── Agent stream ──────────────────────────────────────
  const { run: agentRun, running, steps, error, abort } = useAgentStream('research', {
    onDone: async (result) => {
      console.log('[Research onDone] full result:', JSON.stringify(result).slice(0, 500));

      const data = result?.['data'] as Record<string, unknown> | undefined;
      const report = data?.['report'] as Record<string, unknown> | undefined;
      const textSummary = (result?.['summary'] as string) || '';

      console.log('[Research onDone] report keys:', report ? Object.keys(report) : 'none', 'summary len:', textSummary.length);

      // Build display report from structured data or fallback to text summary
      const displayReport = {
        summary: (report?.summary as string) || textSummary || 'Report completed.',
        topPros: (report?.topPros as { rank: number; topic: string; mentionRate: string; finding: string; quotes: string[] }[]) || [],
        topCons: (report?.topCons as { rank: number; topic: string; mentionRate: string; finding: string; quotes: string[] }[]) || [],
        messaging: (report?.competitorMessaging as { competitor: string; feature: string; messaging: string }[]) || [],
        recommendations: (report?.spRecommendations as string[]) || [],
        sources: (data?.sources as { url: string; type: string; snippetCount: number }[]) || (report?.sources as { url: string; type: string; snippetCount: number }[]) || [],
      };

      console.log('[Research onDone] displayReport: pros=', displayReport.topPros.length, 'cons=', displayReport.topCons.length);

      // Always show the report inline, regardless of project selection
      setLatestReport(displayReport);

      // Auto-save to DB (only if we have project + meaningful data)
      if (selectedProjectId && (report || textSummary)) {
        setSavingReport(true);
        try {
          await fetch('/api/research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: selectedProjectId,
              query: prompt,
              report: report || { summary: textSummary, topPros: [], topCons: [], spRecommendations: [], sources: displayReport.sources },
            }),
          });
          fetchReports();
        } catch (e) {
          console.error('Failed to save report:', e);
        } finally {
          setSavingReport(false);
        }
      }
    },
  });

  // ─── Fetch projects ─────────────────────────────────────
  useEffect(() => {
    cachedFetch<{ id: string; name: string; segment?: string; market?: string }[]>('/api/projects')
      .then((data) => {
        const list = data.map(p => ({ id: p.id, name: p.name, segment: p.segment, market: p.market }));
        setProjects(list);
        if (list.length > 0 && !selectedProjectId) {
          setSelectedProjectId(list[0].id);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Fetch reports ──────────────────────────────────────
  const fetchReports = useCallback(() => {
    setLoadingReports(true);
    cachedFetch<{ reports: (SavedReport & { insights: unknown })[] }>('/api/research')
      .then(data => {
        const raw = data.reports || [];
        // Parse insights JSON: new format stores { topPros, topCons }, legacy stores array
        const mapped = raw.map((r: SavedReport & { insights: unknown }) => {
          const ins = r.insights as { topPros?: ResearchMention[]; topCons?: ResearchMention[] } | ResearchMention[] | null;
          if (ins && !Array.isArray(ins) && typeof ins === 'object') {
            return { ...r, topPros: ins.topPros || [], topCons: ins.topCons || [], insights: null };
          }
          return { ...r, topPros: [], topCons: [], insights: ins };
        });
        setReports(mapped);
      })
      .catch(() => {})
      .finally(() => setLoadingReports(false));
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // ─── Derived ────────────────────────────────────────────
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const fillPrompt = (template: string) => {
    const filled = template
      .replace('{product}', selectedProject?.name || 'the product')
      .replace('{segment}', selectedProject?.segment || 'this segment')
      .replace('{market}', selectedProject?.market || '印度');
    setPrompt(filled);
  };

  const startResearch = useCallback(async () => {
    if (!prompt.trim() || running || !selectedProjectId) return;
    setLatestReport(null);

    // Parse document attachments in the browser — raw bytes never leave the device.
    let documentText: string | undefined;
    const docFiles = attachments.filter(a => a.file && !a.type.startsWith('image'));
    if (docFiles.length > 0 && docFiles[0].file) {
      try {
        const { parseDocumentClient } = await import('@/lib/utils/parse-document-client');
        const parsed = await parseDocumentClient(docFiles[0].file);
        documentText = parsed.text;
      } catch (err) {
        console.error('Document parse failed:', err);
      }
    }

    agentRun({
      projectId: selectedProjectId,
      productName: selectedProject?.name || '',
      segment: selectedProject?.segment,
      market: selectedProject?.market,
      message: prompt.trim(),
      query: prompt.trim(),
      documentText,
    });
  }, [prompt, running, selectedProjectId, agentRun, selectedProject, attachments]);

  // Group reports by project
  const reportsByProject = reports.reduce<Record<string, SavedReport[]>>((acc, r) => {
    const key = r.project.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Deep Research</h1>
        <p className="text-sm text-slate-500 mt-1">
          {zh
            ? '在做决策之前，先收集市场情报。调研报告将自动保存，并注入到你的卖点分级和卖点包装中。'
            : 'Gather market intelligence before making decisions. Reports auto-save and feed into your SP tiering and packaging.'}
        </p>
      </div>

      {/* ─── Research Input Section ──────────────────────────── */}
      <div className="border border-slate-200 rounded-xl bg-white p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Search className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">{zh ? '新建调研' : 'New Research'}</span>
        </div>

        {/* Project selector */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-500 flex-shrink-0">
            {zh ? '关联项目' : 'Project'}
          </label>
          <select
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 min-w-[200px]"
          >
            {projects.length === 0 && (
              <option value="">{zh ? '暂无项目' : 'No projects'}</option>
            )}
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {!selectedProjectId && projects.length === 0 && (
            <Link href="/regions" className="text-xs text-blue-600 hover:text-blue-700">
              {zh ? '先创建一个项目' : 'Create a project first'}
            </Link>
          )}
        </div>

        {/* Quick prompt chips */}
        <div className="flex flex-wrap gap-1.5">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => fillPrompt(qp.prompt)}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              {qp.label}
            </button>
          ))}
        </div>

        {/* Rich input card */}
        <div className="rounded-2xl border border-slate-200 bg-white focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-200 transition-all overflow-hidden">
          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attachments.map(att => (
                <div key={att.id} className="relative group flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                  {att.type === 'image' && att.preview ? (
                    <img src={att.preview} alt={att.name} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  )}
                  <span className="text-[11px] text-slate-600 max-w-[120px] truncate">{att.name}</span>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-800 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => { setPrompt(e.target.value); autoGrow(); }}
            placeholder={zh
              ? `输入你的调研需求，比如：\n· 搜索用户评论，关注电池和拍照\n· 对比竞品在续航方面的宣传话术`
              : `Enter your research request, e.g.:\n· Search user reviews, focus on battery and camera\n· Compare competitor battery messaging`}
            className="w-full text-sm px-4 pt-3 pb-1 resize-none focus:outline-none bg-transparent placeholder:text-slate-400"
            style={{ minHeight: 80, maxHeight: 200 }}
            rows={3}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
            {/* Left: tool buttons */}
            <div className="flex items-center gap-1">
              {/* Plus menu */}
              <div className="relative">
                <button
                  onClick={() => setShowPlusMenu(!showPlusMenu)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title={zh ? '添加文件' : 'Add files'}
                >
                  <Plus className="h-4 w-4" />
                </button>
                {showPlusMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowPlusMenu(false)} />
                    <div className="absolute bottom-full left-0 mb-1 z-20 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[140px]">
                      <button
                        onClick={() => { fileInputRef.current?.click(); }}
                        className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {zh ? '上传文件' : 'Upload file'}
                      </button>
                      <button
                        onClick={() => { imageInputRef.current?.click(); }}
                        className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        {zh ? '上传图片' : 'Upload image'}
                      </button>
                    </div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".csv,.xlsx,.xls,.pdf,.txt,.doc,.docx"
                  onChange={e => handleFileSelect(e.target.files)}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={e => handleFileSelect(e.target.files)}
                />
              </div>

              {/* Paste from clipboard */}
              <button
                onClick={handlePasteFromClipboard}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title={zh ? '从剪贴板粘贴' : 'Paste from clipboard'}
              >
                <Clipboard className="h-4 w-4" />
              </button>

              {/* Insert data reference */}
              <button
                onClick={() => {
                  if (selectedProject) {
                    const ref = zh
                      ? `[关联参数表: ${selectedProject.name}]`
                      : `[Ref: ${selectedProject.name} params]`;
                    setPrompt(prev => prev + (prev ? '\n' : '') + ref);
                    setTimeout(autoGrow, 0);
                  }
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title={zh ? '关联参数表' : 'Reference param table'}
              >
                <Table className="h-4 w-4" />
              </button>
            </div>

            {/* Right: send button */}
            {running ? (
              <button
                onClick={abort}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
                title={zh ? '停止' : 'Stop'}
              >
                <Loader2 className="h-4 w-4 animate-spin" />
              </button>
            ) : (
              <button
                onClick={startResearch}
                disabled={!prompt.trim() || !selectedProjectId}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                  prompt.trim() && selectedProjectId
                    ? 'bg-slate-800 text-white hover:bg-slate-700 shadow-sm'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                )}
                title={zh ? '开始调研' : 'Start research'}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress */}
        {(running || steps.length > 0) && (
          <AgentProgressPanel steps={steps} />
        )}

        {/* Saving indicator */}
        {savingReport && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            {zh ? '正在保存报告...' : 'Saving report...'}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
            {error}
          </div>
        )}
      </div>

      {/* ─── Inline Report Result ───────────────────────────── */}
      {latestReport && (
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
          {/* Header */}
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm font-semibold text-slate-800">{zh ? '调研报告' : 'Research Report'}</span>
            {latestReport.sources.length > 0 && (
              <span className="text-[10px] text-slate-400">{zh ? `基于 ${latestReport.sources.length} 个数据源` : `Based on ${latestReport.sources.length} sources`}</span>
            )}
            {selectedProject && (
              <Link href={`/projects/${selectedProjectId}`} className="ml-auto text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                <ArrowRight className="h-3 w-3" />
                {zh ? '开始工作' : 'Start working'}
              </Link>
            )}
          </div>

          {/* Summary */}
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-sm text-slate-700 leading-relaxed">{latestReport.summary}</p>
          </div>

          {/* Dual-column: Pros & Cons side by side */}
          {(latestReport.topPros.length > 0 || latestReport.topCons.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* Pros column */}
              <div className="p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-xs font-semibold text-green-700">{zh ? '优点 TOP' : 'TOP PROS'}</span>
                </div>
                <div className="space-y-1">
                  {latestReport.topPros.map((item, idx) => (
                    <MentionRow key={idx} item={item} type="pro" />
                  ))}
                </div>
              </div>

              {/* Cons column */}
              <div className="p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-xs font-semibold text-red-600">{zh ? '缺点 TOP' : 'TOP CONS'}</span>
                </div>
                <div className="space-y-1">
                  {latestReport.topCons.map((item, idx) => (
                    <MentionRow key={idx} item={item} type="con" />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SP recommendations — compact pills */}
          {latestReport.recommendations.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex-shrink-0 mt-0.5">
                  {zh ? 'SP 建议' : 'SP'}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {latestReport.recommendations.map((rec, idx) => (
                    <span key={idx} className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded-full px-2.5 py-0.5">{rec}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sources — collapsed row */}
          {latestReport.sources.length > 0 && (
            <div className="px-5 py-2 border-t border-slate-100 flex items-center gap-2">
              <span className="text-[10px] text-slate-400">{zh ? '来源' : 'Sources'}:</span>
              <div className="flex flex-wrap gap-1">
                {latestReport.sources.slice(0, 6).map((s, idx) => (
                  <a key={idx} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 hover:text-blue-600 hover:underline">
                    {(() => { try { return new URL(s.url).hostname.replace('www.', ''); } catch { return s.type; } })()}
                  </a>
                ))}
                {latestReport.sources.length > 6 && (
                  <span className="text-[10px] text-slate-400">+{latestReport.sources.length - 6}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Workflow hint ───────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-100">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">
            {zh ? '工作流程：' : 'Workflow:'}
          </span>
          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
            {zh ? '1. 调研情报' : '1. Research'}
          </span>
          <ArrowRight className="h-3 w-3 text-slate-400" />
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            {zh ? '2. 参数对比' : '2. Compare'}
          </span>
          <ArrowRight className="h-3 w-3 text-slate-400" />
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            {zh ? '3. 卖点分级' : '3. SP Tier'}
          </span>
          <ArrowRight className="h-3 w-3 text-slate-400" />
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            {zh ? '4. 卖点包装' : '4. Packaging'}
          </span>
        </div>
      </div>

      {/* ─── History Section ─────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">
            {zh ? '历史调研报告' : 'Research History'}
          </h2>
          <span className="text-xs text-slate-400">({reports.length})</span>
        </div>

        {loadingReports ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 border border-slate-100 rounded-xl bg-slate-50/50">
            <FileText className="h-8 w-8 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {zh ? '还没有调研报告' : 'No research reports yet'}
            </p>
            <p className="text-xs text-slate-300 mt-1">
              {zh ? '选择一个项目，开始你的第一次调研' : 'Select a project and start your first research'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(reportsByProject).map(([projectName, projectReports]) => (
              <div key={projectName}>
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs font-medium text-slate-500">{projectName}</span>
                  <span className="text-[10px] text-slate-400">({projectReports.length})</span>
                </div>
                <div className="space-y-2">
                  {projectReports.map(report => (
                    <ReportCard key={report.id} report={report} zh={zh} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
