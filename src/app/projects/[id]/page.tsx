'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BarChart3, Sparkles, Package, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import AnimatedBarChart from '@/components/icons/AnimatedBarChart';
import AnimatedPackage from '@/components/icons/AnimatedPackage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation, useAppContext } from '@/lib/store';
import ParamTable from '@/components/param-table/ParamTable';
import SmartPaste from '@/components/param-table/SmartPaste';
import TextParseDialog from '@/components/param-table/TextParseDialog';
import TierBoard from '@/components/sp-board/TierBoard';
import SpVersionButtons from '@/components/sp-board/SpVersionButtons';
import PackagingView from '@/components/packaging/PackagingView';
import PromptPreviewPanel from '@/components/packaging/PromptPreviewPanel';
import PackagingDetailView from '@/components/packaging/PackagingDetailView';
import PositioningDialog, { ProductPositioning } from '@/components/packaging/PositioningDialog';
import ResearchContextPicker from '@/components/packaging/ResearchContextPicker';
import ModelSelector from '@/components/ModelSelector';
import { SpItem, CompetitiveAnalysis, ResearchReport } from '@/types';
import { loadSettings, getConfigForTask, AppSettings } from '@/lib/settings';
import { migrateOldParams } from '@/lib/analysis/migrate-params';
import { SOFT_SELLING_POINTS } from '@/lib/constants/soft-selling-points';
import { PARAM_CATEGORIES } from '@/lib/constants/param-weights';
import { PARAM_DISPLAY_NAMES } from '@/lib/analysis/direction-map';
import ExportDropdown from '@/components/ExportDropdown';
import { toast } from 'sonner';
import CompetitorSearch from '@/components/param-table/CompetitorSearch';
import ChatSidebar from '@/components/chat/ChatSidebar';
import { cachedFetch } from '@/lib/utils/fetch-cache';
import { track } from '@/lib/analytics/track';
import { editFraction } from '@/lib/analytics/edit-fraction';

interface ProductData {
  id: string;
  name: string;
  isOwnProduct: boolean;
  params: string;
  sourceUrl?: string | null;
  sortOrder: number;
}

interface SpResultData {
  id: string;
  tier: number;
  featureName: string;
  paramValue: string;
  leadLevel?: string | null;
  l1Name?: string | null;
  l2Slogan?: string | null;
  l2SloganType?: string | null;
  l2Alternatives?: unknown;
  l3Details?: string | null;
  sortOrder: number;
}

interface AnalysisData {
  id: string;
  result: string; // JSON string
}

interface ProjectData {
  id: string;
  name: string;
  segment?: string;
  market?: string;
  createdAt: string;
  // Optional positioning fields (loaded from Project record)
  targetAudience?: string | null;
  productStyle?: string | null;   // JSON-encoded string[]
  positioning?: string | null;
  packagingStrategy?: string | null;
  products: ProductData[];
  spResults: SpResultData[];
  analyses?: AnalysisData[];
}

/** Convert raw API error messages into short user-friendly text */
function friendlyError(raw: string, locale: string): string {
  const zh = locale === 'zh';
  if (/429|quota|RESOURCE_EXHAUSTED|insufficient.?balance|余额/i.test(raw)) {
    return zh
      ? 'AI 模型调用额度已用完，请充值或切换其他模型'
      : 'AI model quota exceeded. Please top up or switch to another model.';
  }
  if (/401|403|API.?key|INVALID|UNAUTHENTICATED/i.test(raw)) {
    return zh
      ? 'API Key 无效或已过期，请在设置中检查'
      : 'Invalid API key. Please check your key in Settings.';
  }
  if (/503|502|overloaded|service.?unavailable|capacity|过载/i.test(raw)) {
    return zh
      ? '服务提供商临时过载，请稍后切换AI大模型后再试～'
      : 'AI provider is temporarily overloaded. Please switch models and retry.';
  }
  if (/404|not.?found|not.?supported/i.test(raw)) {
    return zh
      ? '所选模型不可用，请在设置中切换模型'
      : 'Selected model is unavailable. Please switch models in Settings.';
  }
  if (/parse|JSON|unexpected/i.test(raw)) {
    return zh
      ? 'AI 返回格式异常，请重试'
      : 'AI returned an invalid response. Please retry.';
  }
  if (/timeout|ECONNREFUSED|network/i.test(raw)) {
    return zh
      ? '网络连接失败，请检查网络后重试'
      : 'Network error. Please check your connection and retry.';
  }
  // Fallback: if Chinese mode, wrap with generic message; otherwise truncate
  if (zh) {
    return 'AI 调用失败：' + (raw.length > 80 ? raw.slice(0, 80) + '…' : raw);
  }
  return raw.length > 100 ? raw.slice(0, 100) + '…' : raw;
}

/** Resizable dialog overlay for packaging detail view */
function ResizablePackagingDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [top, setTop] = useState(() => { try { const v = localStorage.getItem('pkg_dialog_top'); return v ? Number(v) : 4; } catch { return 4; } });
  const [bottom, setBottom] = useState(() => { try { const v = localStorage.getItem('pkg_dialog_bottom'); return v ? Number(v) : 4; } catch { return 4; } });
  const dragEdge = useRef<'top' | 'bottom' | null>(null);
  const dragStartY = useRef(0);
  const dragStartVal = useRef(0);

  const onEdgeDragStart = useCallback((edge: 'top' | 'bottom', e: React.MouseEvent) => {
    e.preventDefault();
    dragEdge.current = edge;
    dragStartY.current = e.clientY;
    dragStartVal.current = edge === 'top' ? top : bottom;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [top, bottom]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragEdge.current) return;
      const deltaVh = ((e.clientY - dragStartY.current) / window.innerHeight) * 100;
      if (dragEdge.current === 'top') {
        const newTop = Math.max(1, Math.min(40, dragStartVal.current + deltaVh));
        setTop(newTop);
      } else {
        const newBottom = Math.max(1, Math.min(40, dragStartVal.current - deltaVh));
        setBottom(newBottom);
      }
    };
    const onUp = () => {
      if (!dragEdge.current) return;
      dragEdge.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem('pkg_dialog_top', String(top)); localStorage.setItem('pkg_dialog_bottom', String(bottom)); } catch {}
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/10 backdrop-blur-[1px]" onClick={onClose} />
      {/* Dialog */}
      <div
        className="fixed z-50 left-1/2 -translate-x-1/2 w-[96vw] rounded-xl bg-white ring-1 ring-slate-200/60 shadow-2xl flex flex-col"
        style={{ top: `${top}vh`, bottom: `${bottom}vh` }}
      >
        {/* Top drag handle — invisible, just the grab area */}
        <div
          onMouseDown={e => onEdgeDragStart('top', e)}
          className="h-1.5 cursor-ns-resize flex-shrink-0 z-20 rounded-t-xl"
        />

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </div>

        {/* Bottom drag handle — invisible, just the grab area */}
        <div
          onMouseDown={e => onEdgeDragStart('bottom', e)}
          className="h-1.5 cursor-ns-resize flex-shrink-0 z-20 rounded-b-xl"
        />
      </div>
    </>
  );
}

export default function ProjectDetailPage() {
  const { t, locale } = useTranslation();
  const { setHeaderLeft } = useAppContext();
  const params = useParams();
  const projectId = params.id as string;

  const cacheKey = `sp-project-cache-${projectId}`;

  const [project, setProjectRaw] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiSettings, setAiSettings] = useState<AppSettings>(() => loadSettings());

  // Wrapper: cache project to localStorage on every update
  const setProject = useCallback((updater: ProjectData | null | ((prev: ProjectData | null) => ProjectData | null)) => {
    setProjectRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next) {
        try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  }, [cacheKey]);

  // Whether to show the param table (false = show centered buttons only)
  const [showTable, setShowTable] = useState(false);




  // Analysis state
  const [analysis, setAnalysis] = useState<CompetitiveAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // SP state
  const [spItems, setSpItems] = useState<SpItem[]>([]);
  const [unrankedItems, setUnrankedItems] = useState<SpItem[]>([]);
  const spLoadedFromDbRef = useRef(false);
  const hasDbResultsRef = useRef(false);

  // Cache analysis + SP to localStorage for offline resilience
  useEffect(() => {
    if (analysis) {
      try { localStorage.setItem(`${cacheKey}-analysis`, JSON.stringify(analysis)); } catch {}
    }
  }, [analysis, cacheKey]);
  useEffect(() => {
    if (spItems.length > 0) {
      try { localStorage.setItem(`${cacheKey}-ksp`, JSON.stringify(spItems)); } catch {}
    }
  }, [spItems, cacheKey]);

  // Export refs for each tab
  const compareExportRef = useRef<HTMLDivElement>(null);
  const spExportRef = useRef<HTMLDivElement>(null);
  const packagingExportRef = useRef<HTMLDivElement>(null);

  // Snapshots of fresh AI-generated packaging keyed by item id.
  // We compare the user's saved value against this snapshot to compute the
  // "AI generation edit rate" — a free quality signal for prompt tuning.
  // Each entry is fired at most once via track('ai_output_edited').
  const aiSnapshotRef = useRef<Record<string, { l1Name: string; l2Slogan: string; l3DetailsJson: string }>>({});

  // Auto-save SP items to DB when user reorders / edits
  const spSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    // Don't save during initial load or if nothing loaded yet
    if (!spLoadedFromDbRef.current) return;
    if (spItems.length === 0) return;

    // For every item with an AI snapshot, check if the user has edited any
    // field. If so, fire one ai_output_edited event and drop the snapshot.
    for (const item of spItems) {
      const snap = aiSnapshotRef.current[item.id];
      if (!snap) continue;
      const curL3 = JSON.stringify(item.l3Details || []);
      const l1Edit = editFraction(snap.l1Name, item.l1Name || '');
      const l2Edit = editFraction(snap.l2Slogan, item.l2Slogan || '');
      const l3Edit = editFraction(snap.l3DetailsJson, curL3);
      if (l1Edit > 0 || l2Edit > 0 || l3Edit > 0) {
        track('ai_output_edited', {
          feature: item.featureName.slice(0, 40),
          tier: item.tier,
          l1Edit,
          l2Edit,
          l3Edit,
        });
        delete aiSnapshotRef.current[item.id];
      }
    }

    if (spSaveTimeoutRef.current) clearTimeout(spSaveTimeoutRef.current);
    spSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/projects/${projectId}/sp-results`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: spItems.map((item, idx) => ({
              tier: item.tier,
              featureName: item.featureName,
              paramValue: item.paramValue || '',
              leadLevel: item.leadLevel,
              l1Name: item.l1Name,
              l2Slogan: item.l2Slogan,
              l2SloganType: item.l2SloganType,
              l2Alternatives: item.l2Alternatives,
              l3Details: item.l3Details,
              sortOrder: idx,
            })),
          }),
        });
      } catch (err) {
        console.error('Failed to auto-save SP items:', err);
      }
    }, 1000);

    return () => {
      if (spSaveTimeoutRef.current) clearTimeout(spSaveTimeoutRef.current);
    };
  }, [spItems, projectId]);

  // Packaging state
  const [isGeneratingPackaging, setIsGeneratingPackaging] = useState(false);
  const [showPositioningDialog, setShowPositioningDialog] = useState(false);
  const [productPositioning, setProductPositioning] = useState<ProductPositioning | null>(null);
  const [showResearchPicker, setShowResearchPicker] = useState(false);
  const [researchContext, setResearchContext] = useState<string>('');
  const [regeneratingItemId, setRegeneratingItemId] = useState<string | null>(null);
  const [selectedPackagingItem, setSelectedPackagingItem] = useState<SpItem | null>(null);
  const [researchReport, setResearchReport] = useState<ResearchReport | null>(null);

  // Keep selected packaging item in sync with spItems
  useEffect(() => {
    if (selectedPackagingItem) {
      const updated = spItems.find(i => i.id === selectedPackagingItem.id);
      if (updated) setSelectedPackagingItem(updated);
    }
  }, [spItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load latest saved research report for this project
  useEffect(() => {
    if (!projectId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cachedFetch<{ reports: any[] }>(`/api/research?projectId=${projectId}`)
      .then(data => {
        const reports = data.reports;
        if (reports && reports.length > 0) {
          const latest = reports[0]; // already ordered by createdAt desc
          setResearchReport({
            summary: latest.summary,
            topPros: latest.insights?.filter?.((i: Record<string, string>) => i.sentiment === 'positive') || latest.topPros || [],
            topCons: latest.insights?.filter?.((i: Record<string, string>) => i.sentiment === 'negative') || latest.topCons || [],
            competitorMessaging: latest.messaging || [],
            spRecommendations: latest.recommendations || [],
            sources: latest.sources || [],
          });
        }
      })
      .catch(() => {});
  }, [projectId]);

  // Delete a SP item
  const handleDeleteSpItem = useCallback((itemId: string) => {
    setSpItems(prev => prev.filter(item => item.id !== itemId));
  }, []);

  // Update a single SP item (inline edit from PackagingView)
  const handleItemUpdate = useCallback((itemId: string, updates: Partial<SpItem>) => {
    setSpItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, ...updates } : item
    ));
  }, []);

  // Regenerate packaging for a single item
  const handleSingleRegenerate = useCallback(async (itemId: string) => {
    const item = spItems.find(i => i.id === itemId);
    if (!item || !project) return;

    const config = getConfigForTask(aiSettings, 'packaging');
    if (!config.apiKey) {
      toast.error(locale === 'zh' ? '请先在设置中配置 AI API Key' : 'Please configure AI API Key in Settings first');
      return;
    }
    setRegeneratingItemId(itemId);

    try {
      const res = await fetch('/api/ai/packaging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spItems: [{ tier: item.tier, featureName: item.featureName, paramValue: item.paramValue }],
          productName: project.products.find(p => p.isOwnProduct)?.name || project.name,
          segment: project.segment,
          locale,
          aiProvider: config.provider,
          apiKey: config.apiKey || undefined,
          model: config.model || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Regeneration failed');
      }

      const result = await res.json();
      const pkg = result.packagingResults?.[0];
      if (pkg) {
        const newL1 = String(pkg.l1Name || '');
        const newL2 = String(pkg.l2Slogan || '');
        const newL3 = Array.isArray(pkg.l3Details) ? pkg.l3Details : [];
        aiSnapshotRef.current[itemId] = {
          l1Name: newL1,
          l2Slogan: newL2,
          l3DetailsJson: JSON.stringify(newL3),
        };
        setSpItems(prev => prev.map(i =>
          i.id === itemId ? {
            ...i,
            l1Name: newL1,
            l2Slogan: newL2,
            l2SloganType: (['factual', 'functional', 'emotional'].includes(String(pkg.l2SloganType))
              ? String(pkg.l2SloganType) as 'factual' | 'functional' | 'emotional'
              : 'functional'),
            l2Alternatives: Array.isArray(pkg.l2Alternatives)
              ? pkg.l2Alternatives.map((a: { text?: string; type?: string }) => ({ text: String(a?.text || ''), type: String(a?.type || 'functional') })).filter((a: { text: string }) => a.text)
              : undefined,
            l3Details: newL3,
          } : i
        ));
        toast.success(locale === 'zh' ? '已重新生成' : 'Regenerated');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setRegeneratingItemId(null);
    }
  }, [spItems, project, locale, aiSettings]);

  // Refine packaging for a single item with user's instruction
  const handleRefine = useCallback(async (itemId: string, refinementPrompt: string) => {
    const item = spItems.find(i => i.id === itemId);
    if (!item || !project) return;

    const config = getConfigForTask(aiSettings, 'packaging');

    // Snapshot current version before refinement
    const currentVersion = {
      version: (item.packagingVersions?.length || 0) + 1,
      l1Name: item.l1Name || '',
      l2Slogan: item.l2Slogan || '',
      l2SloganType: (item.l2SloganType || 'functional') as 'factual' | 'functional' | 'emotional',
      l2Alternatives: item.l2Alternatives,
      l3Details: item.l3Details,
      refinementPrompt: undefined as string | undefined,
      createdAt: new Date().toISOString(),
    };

    const res = await fetch('/api/ai/packaging', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spItems: [{ tier: item.tier, featureName: item.featureName, paramValue: item.paramValue }],
        productName: project.products.find(p => p.isOwnProduct)?.name || project.name,
        segment: project.segment,
        locale,
        aiProvider: config.provider,
        apiKey: config.apiKey || undefined,
        model: config.model || undefined,
        refinementPrompt,
        currentPackaging: {
          l1Name: item.l1Name,
          l2Slogan: item.l2Slogan,
          l2SloganType: item.l2SloganType,
          l3Details: item.l3Details,
        },
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Refinement failed');
    }

    const result = await res.json();
    const pkg = result.packagingResults?.[0];
    if (pkg) {
      const newVersion = {
        version: currentVersion.version + 1,
        l1Name: String(pkg.l1Name || ''),
        l2Slogan: String(pkg.l2Slogan || ''),
        l2SloganType: (['factual', 'functional', 'emotional'].includes(String(pkg.l2SloganType))
          ? String(pkg.l2SloganType) as 'factual' | 'functional' | 'emotional'
          : 'functional'),
        l2Alternatives: Array.isArray(pkg.l2Alternatives)
          ? pkg.l2Alternatives.map((a: { text?: string; type?: string }) => ({ text: String(a?.text || ''), type: String(a?.type || 'functional') })).filter((a: { text: string }) => a.text)
          : undefined,
        l3Details: Array.isArray(pkg.l3Details) ? pkg.l3Details : [],
        refinementPrompt,
        createdAt: new Date().toISOString(),
      };

      setSpItems(prev => prev.map(i =>
        i.id === itemId ? {
          ...i,
          l1Name: newVersion.l1Name,
          l2Slogan: newVersion.l2Slogan,
          l2SloganType: newVersion.l2SloganType,
          l2Alternatives: newVersion.l2Alternatives,
          l3Details: newVersion.l3Details,
          packagingVersions: [...(i.packagingVersions || []), currentVersion, newVersion],
        } : i
      ));
      toast.success(locale === 'zh' ? '微调完成，已生成新版本' : 'Refinement done, new version generated');
    }
  }, [spItems, project, locale, aiSettings]);

  // Handle parsed products from SmartPaste / TextParseDialog.
  // Updates state directly (no page reload) so data is never lost.
  const handleParsedProducts = useCallback(
    async (parsedProducts: Array<{ name: string; isOwnProduct: boolean; params: Record<string, string> }>) => {
      // Single product → treat as own product
      if (parsedProducts.length === 1) {
        parsedProducts[0].isOwnProduct = true;
      }

      const products = parsedProducts.map((p, idx) => ({
        id: `${p.isOwnProduct ? 'own' : 'comp'}-${Date.now()}-${idx}`,
        name: p.name,
        isOwnProduct: p.isOwnProduct,
        params: p.params,
        sortOrder: idx,
      }));

      // Update local state immediately so data appears
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          products: products.map((p) => ({
            id: p.id,
            name: p.name,
            isOwnProduct: p.isOwnProduct,
            params: typeof p.params === 'string' ? p.params : JSON.stringify(p.params),
            sortOrder: p.sortOrder,
          })),
        };
      });
      setShowTable(true);

      // Save to DB in background (non-blocking)
      try {
        await fetch(`/api/projects/${projectId}/products`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products }),
        });
      } catch (err) {
        console.error('Failed to save products to DB:', err);
      }
    },
    [projectId]
  );

  // Keep local in-memory params in sync with ParamTable autosave.
  // This ensures AI analysis uses the latest edits even before a full page reload.
  const handleParamTableSave = useCallback(
    (
      updated: Array<{
        id: string;
        name: string;
        isOwnProduct: boolean;
        values: Record<string, string>;
      }>
    ) => {
      setProject((prev) => {
        if (!prev) return prev;

        const prevById = new Map(prev.products.map((p) => [p.id, p]));
        let nextSortOrder =
          prev.products.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0) + 1;

        return {
          ...prev,
          products: updated.map((p) => {
            const old = prevById.get(p.id);
            return {
              id: p.id,
              name: p.name,
              isOwnProduct: p.isOwnProduct,
              params: JSON.stringify(p.values || {}),
              sortOrder: old?.sortOrder ?? nextSortOrder++,
            };
          }),
        };
      });
    },
    []
  );

  const loadProjectData = useCallback((data: ProjectData) => {
    setProject(data);

    // Restore analysis from DB
    if (data.analyses && data.analyses.length > 0) {
      try {
        const raw = data.analyses[0].result;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        setAnalysis(parsed);
      } catch {
        console.error('Failed to parse stored analysis');
      }
    }

    // Restore SP items from DB
    if (data.spResults && data.spResults.length > 0) {
      const restored: SpItem[] = data.spResults.map(
        (r: SpResultData, idx: number) => ({
          id: r.id || `sp-db-${idx}`,
          tier: r.tier as 0 | 1 | 2 | 3,
          featureName: r.featureName,
          paramValue: r.paramValue || '',
          leadLevel: (['strong_lead', 'slight_lead', 'neutral', 'slight_lag', 'strong_lag'].includes(r.leadLevel || '')
            ? r.leadLevel as SpItem['leadLevel']
            : undefined),
          l1Name: r.l1Name || undefined,
          l2Slogan: r.l2Slogan || undefined,
          l2SloganType: ((['factual', 'functional', 'emotional'].includes(r.l2SloganType || ''))
            ? r.l2SloganType as 'factual' | 'functional' | 'emotional'
            : undefined),
          l2Alternatives: Array.isArray(r.l2Alternatives)
            ? (r.l2Alternatives as Array<{ text: string; type: string }>)
            : undefined,
          l3Details: r.l3Details ? (typeof r.l3Details === 'string' ? JSON.parse(r.l3Details) : r.l3Details) : undefined,
          sortOrder: r.sortOrder ?? idx,
        })
      );
      // Filter out non-selling-point items (price, launch time)
      const EXCLUDED_NAMES = ['价格', 'price', 'misc.price', '售价', 'launch', '上市时间', '发布时间', 'display.size', '屏幕尺寸', 'screen size'];
      const filtered = restored.filter(
        (item) => !EXCLUDED_NAMES.some((p) => item.featureName.toLowerCase().includes(p.toLowerCase()))
      );

      // Append missing soft selling points as tier=0 (draggable pool)
      const existingFeatures = filtered.map((r) => r.featureName.toLowerCase());
      for (const sp of SOFT_SELLING_POINTS) {
        const exactNames = [sp.nameEn.toLowerCase(), sp.nameZh.toLowerCase(), sp.key];
        const alreadyCovered = existingFeatures.some(existing =>
          exactNames.includes(existing) || exactNames.some(n => existing === n)
        );
        if (!alreadyCovered) {
          filtered.push({
            id: `soft-${sp.key}`,
            tier: 0,
            featureName: sp.nameZh,
            paramValue: '',
            sortOrder: 999,
          });
        }
      }

      filtered.sort((a, b) => a.tier - b.tier || a.sortOrder - b.sortOrder);
      setSpItems(filtered);
    }

    // Mark as loaded so auto-save can start tracking changes
    spLoadedFromDbRef.current = true;

    // If DB had analysis OR SP, suppress auto-generation.
    // This prevents agent results (which always have SP) from being wiped
    // by auto-analysis even if analysis is temporarily missing.
    const hasAnalysis = data.analyses && data.analyses.length > 0;
    const hasKsp = data.spResults && data.spResults.length > 0;
    if (hasAnalysis || hasKsp) {
      hasDbResultsRef.current = true;
    }
  }, []);

  const refreshProject = useCallback(() => {
    cachedFetch<ProjectData>(`/api/projects/${projectId}`)

      .then((data) => {
        if (!data) return;

        // Compare DB data with localStorage cache — use whichever has more product data
        let useData = data;
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const cachedData = JSON.parse(cached);
            const dbProductParams = (data.products || []).reduce((sum: number, p: ProductData) => {
              const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
              return sum + Object.keys(params || {}).length;
            }, 0);
            const cacheProductParams = (cachedData.products || []).reduce((sum: number, p: ProductData) => {
              const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
              return sum + Object.keys(params || {}).length;
            }, 0);
            // If cache has more data (more products or more params), prefer cache
            if (cacheProductParams > dbProductParams && cachedData.products?.length > 0) {
              console.log(`[Project] Using localStorage cache (${cacheProductParams} params) over DB (${dbProductParams} params)`);
              useData = { ...data, products: cachedData.products };
              // Re-save to DB in background
              const prods = cachedData.products.map((p: ProductData) => ({
                id: p.id, name: p.name, isOwnProduct: p.isOwnProduct,
                params: typeof p.params === 'string' ? JSON.parse(p.params) : p.params,
                sortOrder: p.sortOrder,
              }));
              fetch(`/api/projects/${projectId}/products`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products: prods }),
              }).catch(() => {});
            }
          }
        } catch {}

        loadProjectData(useData);

        // Restore analysis/SP from cache if DB has none
        try {
          if ((!useData.analyses || useData.analyses.length === 0)) {
            const cachedAnalysis = localStorage.getItem(`${cacheKey}-analysis`);
            if (cachedAnalysis) setAnalysis(JSON.parse(cachedAnalysis));
          }
          if ((!useData.spResults || useData.spResults.length === 0)) {
            const cachedKsp = localStorage.getItem(`${cacheKey}-ksp`);
            if (cachedKsp) {
              const items = JSON.parse(cachedKsp);
              setSpItems(items);
              spLoadedFromDbRef.current = true;
              // Re-save SP to DB
              fetch(`/api/projects/${projectId}/sp-results`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: items.map((item: SpItem, idx: number) => ({
                  tier: item.tier, featureName: item.featureName,
                  paramValue: item.paramValue, leadLevel: item.leadLevel,
                  sortOrder: idx,
                })) }),
              }).catch(() => {});
            }
          }
        } catch {}

        setLoading(false);
      })
      .catch((err) => {
        console.error('DB fetch failed, trying localStorage cache:', err.message);
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            loadProjectData(JSON.parse(cached));
            console.log('[Project] Restored from localStorage cache');
          }
          const cachedAnalysis = localStorage.getItem(`${cacheKey}-analysis`);
          if (cachedAnalysis) setAnalysis(JSON.parse(cachedAnalysis));
          const cachedKsp = localStorage.getItem(`${cacheKey}-ksp`);
          if (cachedKsp) {
            setSpItems(JSON.parse(cachedKsp));
            spLoadedFromDbRef.current = true;
          }
        } catch {}
        setLoading(false);
      });
  }, [projectId, loadProjectData, cacheKey]);

  // Handle adding competitors from CompetitorSearch
  const handleCompetitorSearchAdd = useCallback(
    async (parsed: Array<{ name: string; isOwnProduct: boolean; params: Record<string, string>; sourceUrl?: string }>) => {
      if (!project || parsed.length === 0) return;

      let nextOrder = project.products.reduce(
        (max, p) => Math.max(max, p.sortOrder ?? 0),
        0
      ) + 1;

      const newProducts = parsed.map((c) => ({
        id: `comp-search-${Date.now()}-${nextOrder}`,
        name: c.name,
        isOwnProduct: c.isOwnProduct,
        params: typeof c.params === 'string' ? c.params : JSON.stringify(c.params),
        sourceUrl: c.sourceUrl,
        sortOrder: nextOrder++,
      }));

      // Update state immediately
      setProject((prev) => {
        if (!prev) return prev;
        return { ...prev, products: [...prev.products, ...newProducts] };
      });

      // Save to DB in background
      const allProducts = [
        ...project.products.map((p) => ({
          id: p.id,
          name: p.name,
          isOwnProduct: p.isOwnProduct,
          params: typeof p.params === 'string' ? JSON.parse(p.params) : p.params,
          sourceUrl: p.sourceUrl,
          sortOrder: p.sortOrder,
        })),
        ...parsed.map((c, i) => ({
          id: newProducts[i].id,
          name: c.name,
          isOwnProduct: c.isOwnProduct,
          params: c.params,
          sourceUrl: c.sourceUrl,
          sortOrder: newProducts[i].sortOrder,
        })),
      ];

      try {
        await fetch(`/api/projects/${projectId}/products`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products: allProducts }),
        });
      } catch (err) {
        console.error('Failed to save competitors:', err);
      }
    },
    [project, projectId]
  );

  useEffect(() => {
    if (!projectId) return;
    refreshProject();
  }, [projectId, refreshProject]);

  // Set back link in header
  useEffect(() => {
    if (!project) {
      setHeaderLeft(null);
      return;
    }
    setHeaderLeft(
      <Link
        href={project.market ? `/regions/${encodeURIComponent(project.market)}` : '/regions'}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {project.market || '返回'}
      </Link>
    );
    return () => setHeaderLeft(null);
  }, [project, setHeaderLeft]);

  // Run rule-based analysis + SP tiering (no AI needed).
  const runAnalysisAndKsp = useCallback(
    async (runHash: string) => {
      if (!project) return;

      const products = project.products.map((p) => ({
        ...p,
        params: typeof p.params === 'string' ? JSON.parse(p.params) : p.params,
      }));
      const ownProduct = products.find((p) => p.isOwnProduct);
      const competitors = products.filter((p) => !p.isOwnProduct);

      if (!ownProduct || competitors.length === 0) {
        setAnalysisError('Need at least 1 own product and 1 competitor.');
        return;
      }

      setIsAnalyzing(true);
      setAnalysisError(null);

      try {
        const res = await fetch('/api/ai/analyze-sp-tier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            ownProduct: { name: ownProduct.name, params: ownProduct.params },
            competitors: competitors.map((c) => ({
              name: c.name,
              params: c.params,
            })),
            locale,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Analysis+SP generation failed');
        }

        const result = await res.json();
        setAnalysis(result.analysis);

        const itemsRaw: unknown[] = Array.isArray(result?.spItems) ? result.spItems : [];
        const normalizeTier = (tier: unknown): 0 | 1 | 2 | 3 | undefined => {
          if (tier === 0 || tier === 1 || tier === 2 || tier === 3) return tier;
          if (typeof tier === 'number' && tier >= 0 && tier <= 3) {
            return tier as 0 | 1 | 2 | 3;
          }
          if (typeof tier === 'string') {
            const m = tier.toUpperCase().match(/[0123]/);
            if (!m) return undefined;
            const n = Number(m[0]);
            if (n >= 0 && n <= 3) return n as 0 | 1 | 2 | 3;
          }
          return undefined;
        };

        const items: SpItem[] = itemsRaw
          .map((item, idx): SpItem | null => {
            const itemObj =
              item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
            const tier = normalizeTier(itemObj['tier']);
            if (tier === undefined) return null;
            const featureName = String(
              itemObj['featureName'] ?? itemObj['feature'] ?? itemObj['parameter'] ?? ''
            ).trim();
            if (!featureName) return null;
            const paramValue = String(
              itemObj['paramValue'] ?? itemObj['param_value'] ?? itemObj['value'] ?? ''
            ).trim();
            const reasoning = typeof itemObj['reasoning'] === 'string' ? itemObj['reasoning'] : undefined;
            const leadLevel = typeof itemObj['leadLevel'] === 'string' ? itemObj['leadLevel'] as SpItem['leadLevel'] : undefined;
            return {
              id: `sp-${idx}`,
              tier,
              featureName,
              paramValue,
              reasoning,
              leadLevel,
              sortOrder: idx,
            } as SpItem;
          })
          .filter((x): x is SpItem => x !== null);

        items.sort((a, b) => a.tier - b.tier || a.sortOrder - b.sortOrder);

        // Preserve existing packaging data (l1Name, l2Slogan, l3Details) from previous SP items
        // so that re-running analysis doesn't wipe out already-generated packaging results.
        // Also merge by category keywords to handle "芯片" matching user's "MTK 7400 Ultra".
        const CATEGORY_KEYWORDS: Record<string, string[]> = {
          chipset: ['芯片', '处理器', 'chipset', 'processor', 'soc', 'mtk', 'dimensity', '天玑', 'snapdragon', '骁龙', 'helio', 'kirin', '麒麟', 'exynos', 'unisoc'],
          battery: ['电池', 'battery', 'mah', '续航'],
          charging: ['充电', 'charging', '快充'],
          camera: ['后摄', '摄像', 'camera', '主摄', '影像'],
          selfie: ['前摄', '前置', 'selfie', '自拍'],
          display: ['屏幕', 'display', '刷新', 'hz', 'nits', '亮度'],
          memory: ['内存', '存储', 'memory', 'ram', 'rom', 'storage'],
          weight: ['重量', 'weight', '克'],
          protection: ['防水', '防尘', '防护', 'ip6', 'ip5', 'protection'],
        };
        const getCategoryOf = (name: string): string | null => {
          const lower = name.toLowerCase();
          for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
            if (kws.some(kw => lower.includes(kw))) return cat;
          }
          return null;
        };

        setSpItems((prev) => {
          if (prev.length === 0) return items;
          // Build lookup by exact name and by category
          const prevByName = new Map<string, SpItem>();
          const prevByCat = new Map<string, SpItem>();
          for (const p of prev) {
            if (p.l1Name || p.l2Slogan) {
              prevByName.set(p.featureName.toLowerCase().trim(), p);
              const cat = getCategoryOf(p.featureName);
              if (cat) prevByCat.set(cat, p);
            }
          }
          return items.map((item) => {
            const existing = prevByName.get(item.featureName.toLowerCase().trim())
              || prevByCat.get(getCategoryOf(item.featureName) || '');
            if (existing) {
              return {
                ...item,
                l1Name: existing.l1Name,
                l2Slogan: existing.l2Slogan,
                l2SloganType: existing.l2SloganType,
                l2Alternatives: existing.l2Alternatives,
                l3Details: existing.l3Details,
              };
            }
            return item;
          });
        });
        spLoadedFromDbRef.current = true;

        lastAnalysisSpHashRef.current = runHash;
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : 'Analysis+SP failed';
        const friendly = friendlyError(rawMsg, locale);
        setAnalysisError(friendly);
        toast.error(friendly);
        // Mark hash so we don't retry infinitely on persistent errors
        lastAnalysisSpHashRef.current = runHash;
      } finally {
        setIsAnalyzing(false);
      }
    },
    [project, locale]
  );

  // Generate packaging
  // Show positioning dialog first, then generate
  const handleGeneratePackaging = useCallback(() => {
    setShowPositioningDialog(true);
  }, []);

  const generatePackaging = useCallback(async (pos?: ProductPositioning | null) => {
    if (spItems.length === 0 || !project) return;
    const config = getConfigForTask(aiSettings, 'packaging');
    if (!config.apiKey) {
      toast.error(locale === 'zh' ? '请先在设置中配置 AI API Key' : 'Please configure AI API Key in Settings first');
      return;
    }

    const ownProduct = project.products.find((p) => p.isOwnProduct);
    if (!ownProduct) {
      toast.error(locale === 'zh' ? '请先添加自己的产品' : 'Please add your own product first');
      return;
    }

    setIsGeneratingPackaging(true);
    const packagingStart = Date.now();
    const itemCount = spItems.filter(i => i.tier >= 1 && i.tier <= 3).length;
    track('ai_packaging_started', { itemCount, provider: config.provider });
    try {
      const res = await fetch('/api/ai/packaging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spItems: [...spItems]
            .filter((i) => i.tier >= 1 && i.tier <= 3)  // Only send ranked items (exclude tier-0 soft selling points)
            .sort((a, b) => a.tier - b.tier || a.sortOrder - b.sortOrder)
            .map((i) => ({
              tier: i.tier,
              featureName: i.featureName,
              paramValue: i.paramValue,
            })),
          productName: ownProduct.name,
          segment: project.segment,
          competitorContext: analysis ? JSON.stringify(analysis) : undefined,
          researchContext: researchContext || undefined,
          positioning: pos ? {
            targetAudience: pos.targetAudience,
            productStyle: pos.productStyle,
            positioning: pos.positioning,
            referencePackaging: pos.referencePackaging,
          } : undefined,
          packagingStrategy: pos?.packagingStrategy,
          projectId,
          locale,
          aiProvider: config.provider,
          apiKey: config.apiKey,
          model: config.model || undefined,
        }),
      });

      if (!res.ok) {
        track('ai_packaging_failed', { status: res.status, durationMs: Date.now() - packagingStart });
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Packaging generation failed');
      }
      const result = await res.json();
      track('ai_packaging_succeeded', { itemCount, durationMs: Date.now() - packagingStart, provider: config.provider });

      // Merge packaging results into spItems.
      // The API now returns results in the same order as the input spItems,
      // so we match by index first, then fall back to featureName.
      const pkgResults: Array<Record<string, unknown>> = result.packagingResults || [];

      // Build name-based lookup as fallback
      const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, '').trim();
      const pkgByName = new Map<string, Record<string, unknown>>();
      for (const pkg of pkgResults) {
        if (pkg.featureName) pkgByName.set(normalize(String(pkg.featureName)), pkg);
      }

      setSpItems((prev) => {
        // The packaging request only included tier 1-3 items, sorted by tier.
        // Reconstruct same order for index matching, then apply to all items.
        const rankedPrev = [...prev]
          .filter((i) => i.tier >= 1 && i.tier <= 3)
          .sort((a, b) => a.tier - b.tier || a.sortOrder - b.sortOrder);

        // Build ID-based lookup from index-matched results
        const pkgById = new Map<string, Record<string, unknown>>();
        for (let idx = 0; idx < rankedPrev.length; idx++) {
          const pkg = pkgResults[idx] || pkgByName.get(normalize(rankedPrev[idx].featureName));
          if (pkg) pkgById.set(rankedPrev[idx].id, pkg);
        }

        const merged = prev.map((item) => {
          // Try ID match (from index-based matching above), then name fallback
          const pkg = pkgById.get(item.id) || pkgByName.get(normalize(item.featureName));
          if (!pkg) return item;
          const sloganType = String(pkg.l2SloganType || 'functional');
          const newL1 = String(pkg.l1Name || '');
          const newL2 = String(pkg.l2Slogan || '');
          const newL3 = Array.isArray(pkg.l3Details) ? pkg.l3Details : [];
          aiSnapshotRef.current[item.id] = {
            l1Name: newL1,
            l2Slogan: newL2,
            l3DetailsJson: JSON.stringify(newL3),
          };
          return {
            ...item,
            l1Name: newL1,
            l2Slogan: newL2,
            l2SloganType: (['factual', 'functional', 'emotional'].includes(sloganType)
              ? sloganType
              : 'functional') as 'factual' | 'functional' | 'emotional',
            l2Alternatives: Array.isArray(pkg.l2Alternatives)
              ? (pkg.l2Alternatives as Array<{ text?: string; type?: string }>)
                  .map(a => ({ text: String(a?.text || ''), type: String(a?.type || 'functional') }))
                  .filter(a => a.text)
              : undefined,
            l3Details: newL3,
          };
        });
        return merged;
      });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Packaging failed';
      toast.error(friendlyError(rawMsg, locale));
    } finally {
      setIsGeneratingPackaging(false);
    }
  }, [spItems, project, analysis, locale, aiSettings]);

  // Active tab state
  const [activeTab, setActiveTab] = useState<'compare' | 'ksp' | 'packaging'>('compare');

  // Whether the user has entered meaningful parameter data for both
  // the "own product" and at least one competitor.
  // Used to unlock SP tab and trigger auto generation.
  const hasParamData =
    !!project &&
    (() => {
      let hasOwn = false;
      let hasCompetitor = false;
      for (const p of project.products) {
        try {
          const parsed = (typeof p.params === 'string' ? JSON.parse(p.params || '{}') : p.params || {}) as Record<string, string>;
          if (!parsed || Object.keys(parsed).length === 0) continue;
          if (p.isOwnProduct) hasOwn = true;
          else hasCompetitor = true;
          if (hasOwn && hasCompetitor) return true;
        } catch {
          // ignore parse failures
        }
      }
      return false;
    })();

  const lastAnalysisSpHashRef = useRef<string>('');
  const inFlightRef = useRef(false);

  // Hash only product data + context — NOT the AI provider/model.
  // Changing the model should NOT auto-trigger regeneration.
  const paramsHash = useMemo(() => {
    if (!project) return '';
    const payload = {
      projectId,
      segment: project.segment || '',
      market: project.market || '',
      products: project.products
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((p) => ({
          id: p.id,
          isOwnProduct: p.isOwnProduct,
          params: p.params,
        })),
    };
    return JSON.stringify(payload);
  }, [project, projectId]);

  // Auto run: analysis + SP tiering should be tied to param comparison.
  useEffect(() => {
    if (!hasParamData) return;
    if (!paramsHash) return;

    // If we loaded results from DB, lock the current hash and never auto-run
    // until params actually change from user edits.
    if (hasDbResultsRef.current) {
      hasDbResultsRef.current = false;
      lastAnalysisSpHashRef.current = paramsHash;
      return;
    }

    // Don't rerun if hash hasn't changed
    if (paramsHash === lastAnalysisSpHashRef.current) return;
    if (isAnalyzing) return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    runAnalysisAndKsp(paramsHash).finally(() => {
      inFlightRef.current = false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasParamData, paramsHash, isAnalyzing]);

  // Compute unranked params: own product params not already in spItems
  // All hooks must be ABOVE conditional returns to satisfy Rules of Hooks.
  const computedUnranked = useMemo(() => {
    if (!project) return [];
    const ownProd = project.products.find((p) => p.isOwnProduct);
    if (!ownProd) return [];
    let ownParams: Record<string, string>;
    try { ownParams = typeof ownProd.params === 'string' ? JSON.parse(ownProd.params) : ownProd.params as Record<string, string>; } catch { return []; }
    if (spItems.length === 0) return [];
    if (unrankedItems.length > 0) return unrankedItems;

    // Build reverse lookup: display name / field key → category key
    const nameToCategory = new Map<string, string>();
    for (const cat of PARAM_CATEGORIES) {
      nameToCategory.set(cat.key, cat.key);
      nameToCategory.set(cat.nameEn.toLowerCase(), cat.key);
      nameToCategory.set(cat.nameZh, cat.key);
      for (const field of cat.fields) {
        nameToCategory.set(field.key, cat.key);
        nameToCategory.set(field.nameEn.toLowerCase(), cat.key);
        nameToCategory.set(field.nameZh, cat.key);
      }
    }
    // Also add PARAM_DISPLAY_NAMES (covers both dot-notation and legacy keys)
    for (const [key, names] of Object.entries(PARAM_DISPLAY_NAMES)) {
      const cat = key.includes('.') ? key.split('.')[0] : key;
      nameToCategory.set(key, cat);
      nameToCategory.set(names.en.toLowerCase(), cat);
      nameToCategory.set(names.zh, cat);
    }

    // Determine which categories are already covered by SP items
    const coveredCategories = new Set<string>();
    for (const ksp of spItems) {
      const fn = ksp.featureName;
      // Try exact match on feature name
      const cat = nameToCategory.get(fn) || nameToCategory.get(fn.toLowerCase());
      if (cat) { coveredCategories.add(cat); continue; }
      // Try substring match against all known names
      for (const [name, catKey] of nameToCategory) {
        if (name.length >= 2 && fn.includes(name)) { coveredCategories.add(catKey); break; }
        if (name.length >= 2 && fn.toLowerCase().includes(name.toLowerCase())) { coveredCategories.add(catKey); break; }
      }
    }

    return Object.entries(ownParams)
      .filter(([key, val]) => {
        if (!val) return false;
        const cat = key.includes('.') ? key.split('.')[0] : key;
        if (coveredCategories.has(cat)) return false;
        // Also check if the exact param key is covered (e.g. "platform.chipset" covered by "芯片")
        if (coveredCategories.has(key)) return false;
        if (key === 'launch' || key === 'others' || key === 'display.size') return false;
        return true;
      })
      .map(([key, val], idx) => {
        // Use display name instead of raw param key to avoid duplicates like "platform.chipset" vs "芯片"
        const displayName = PARAM_DISPLAY_NAMES[key]
          ? (locale === 'zh' ? PARAM_DISPLAY_NAMES[key].zh : PARAM_DISPLAY_NAMES[key].en)
          : key;
        return {
          id: `unranked-${key}`,
          tier: 1 as const,
          featureName: displayName,
          paramValue: val,
          sortOrder: idx,
        };
      });
  }, [project, spItems, unrankedItems]);

  // Initialize unranked on first load
  const unrankedInitRef = useRef(false);
  useEffect(() => {
    if (unrankedInitRef.current) return;
    if (computedUnranked.length > 0 && unrankedItems.length === 0) {
      setUnrankedItems(computedUnranked);
      unrankedInitRef.current = true;
    }
  }, [computedUnranked, unrankedItems.length]);

  // Build context string for the chat sidebar (must be before early returns to preserve hook order)
  const buildChatContext = useCallback(() => {
    if (!project) return '';
    const parts: string[] = [];
    const ownProduct = project.products.find(p => p.isOwnProduct);

    parts.push(`Project: ${project.name}`);
    if (project.segment) parts.push(`Segment: ${project.segment}`);
    if (project.market) parts.push(`Market: ${project.market}`);

    if (ownProduct) {
      parts.push(`\nOwn Product: ${ownProduct.name}`);
      const paramEntries = Object.entries(ownProduct.params || {}).slice(0, 15);
      if (paramEntries.length > 0) {
        parts.push('Key Specs: ' + paramEntries.map(([k, v]) => `${k}=${v}`).join(', '));
      }
    }

    const competitors = project.products.filter(p => !p.isOwnProduct);
    if (competitors.length > 0) {
      parts.push(`\nCompetitors: ${competitors.map(c => c.name).join(', ')}`);
    }

    if (analysis) {
      const adv = analysis.advantages?.slice(0, 5).map(a => `${a.feature}: ${a.assessment}`).join('; ');
      const dis = analysis.disadvantages?.slice(0, 3).map(a => `${a.feature}: ${a.assessment}`).join('; ');
      if (adv) parts.push(`\nAdvantages: ${adv}`);
      if (dis) parts.push(`Disadvantages: ${dis}`);
    }

    if (spItems.length > 0) {
      const t1 = spItems.filter(i => i.tier === 1).map(i => `${i.featureName}(${i.paramValue})`).join(', ');
      const t2 = spItems.filter(i => i.tier === 2).map(i => `${i.featureName}(${i.paramValue})`).join(', ');
      const t3 = spItems.filter(i => i.tier === 3).map(i => `${i.featureName}(${i.paramValue})`).join(', ');
      parts.push(`\nKSP T1: ${t1 || 'none'}`);
      parts.push(`SP T2: ${t2 || 'none'}`);
      parts.push(`SP T3: ${t3 || 'none'}`);

      const packaged = spItems.filter(i => i.l1Name);
      if (packaged.length > 0) {
        parts.push(`\nPackaging:`);
        packaged.forEach(i => {
          parts.push(`- ${i.l1Name}: "${i.l2Slogan}" (${i.l2SloganType})`);
        });
      }
    }

    if (researchReport) {
      parts.push(`\nResearch Report Summary: ${researchReport.summary}`);
      if (researchReport.spRecommendations?.length) {
        parts.push('Research Recommendations: ' + researchReport.spRecommendations.join('; '));
      }
    }

    return parts.join('\n');
  }, [project, analysis, spItems, researchReport]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-12 text-center text-slate-400">
        {t('common.loading')}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-6xl mx-auto py-12 text-center text-slate-400">
        Project not found
      </div>
    );
  }

  const initialProducts = project.products.map((p) => {
    // params is now Json type in PostgreSQL — Prisma returns it as an object directly
    const raw = (typeof p.params === 'string' ? JSON.parse(p.params) : p.params) as Record<string, string>;
    const values = migrateOldParams(raw);
    return { id: p.id, name: p.name, isOwnProduct: p.isOwnProduct, values, sourceUrl: p.sourceUrl || undefined };
  });

  // Status indicators for each section
  const compareStatus = analysis ? 'done' : 'ready';
  const spStatus = spItems.length > 0 ? 'done' : hasParamData ? 'ready' : 'locked';
  const packagingStatus = spItems.some((i) => i.l1Name) ? 'done' : spItems.length > 0 ? 'ready' : 'locked';

  const statusBadge = (status: string) => {
    switch (status) {
      case 'done':
        return <Badge className="bg-green-100 text-green-600 text-[10px] font-normal">{locale === 'zh' ? '已完成' : 'Done'}</Badge>;
      case 'ready':
        return <Badge className="bg-slate-100 text-slate-800 text-[10px] font-normal">{locale === 'zh' ? '可操作' : 'Ready'}</Badge>;
      case 'locked':
        return <Badge className="bg-slate-100 text-slate-400 text-[10px] font-normal">{locale === 'zh' ? '待解锁' : 'Locked'}</Badge>;
      default:
        return null;
    }
  };

  const tabItems = [
    { key: 'compare' as const, label: t('compare.title'), icon: BarChart3, status: compareStatus },
    { key: 'ksp' as const, label: t('ksp.title'), icon: Sparkles, status: spStatus },
    { key: 'packaging' as const, label: t('packaging.title'), icon: Package, status: packagingStatus },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Project Header + Export buttons */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
            {project.name}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            {project.segment && (
              <Badge variant="secondary" className="text-xs font-normal">
                {project.segment}
              </Badge>
            )}
            {project.market && (
              <Badge variant="secondary" className="text-xs font-normal">
                {project.market}
              </Badge>
            )}
          </div>
        </div>
        {/* Export/refresh buttons moved to each tab's toolbar */}
      </div>

      {/* Tab bar */}
      <div className="grid grid-cols-3 gap-3">
        {tabItems.map((tab) => {
          const isActive = activeTab === tab.key;
          const isLocked = tab.status === 'locked';
          return (
            <button
              key={tab.key}
              onClick={() => !isLocked && setActiveTab(tab.key)}
              className={`relative flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-slate-800 text-white shadow-lg'
                  : isLocked
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:shadow-sm'
              }`}
            >
              {tab.key === 'compare' ? (
                <AnimatedBarChart className="h-4 w-4" animate={isActive} />
              ) : tab.key === 'packaging' ? (
                <AnimatedPackage className="h-4 w-4" animate={isActive} />
              ) : (
                <tab.icon
                  key={isActive ? `${tab.key}-active` : tab.key}
                  className={`h-4 w-4 ${
                    isActive && tab.key === 'ksp'
                      ? 'animate-[tabSparkle_3s_linear_infinite]'
                      : ''
                  }`}
                />
              )}
              {tab.label}
              {/* Status dot */}
              <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
                tab.status === 'done' ? 'bg-green-400' :
                tab.status === 'ready' ? 'bg-slate-500' :
                'bg-slate-300'
              }`} />
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div className="min-h-[400px]">

        {/* Compare tab content */}
        {activeTab === 'compare' && (
          <div className="space-y-6">
            {/* Show table if has products with data */}
            {initialProducts.some((p) => Object.keys(p.values).length > 0) ? (
              <>
                <div ref={compareExportRef}>
                <ParamTable
                  projectId={projectId}
                  initialProducts={initialProducts}
                  onSave={handleParamTableSave}
                  smartPasteFooterLeft={<ModelSelector settings={aiSettings} onSettingsChange={setAiSettings} compact />}
                  extraToolbarButtons={
                    <CompetitorSearch
                      onParsed={handleCompetitorSearchAdd}
                      market={project.market || undefined}
                    />
                  }
                  rightToolbarButtons={
                    <>
                      <ExportDropdown
                        targetRef={compareExportRef}
                        filename={`${project.name}-参数对比.png`}
                        projectName={project.name}
                        activeTab="compare"
                        spItems={spItems}
                        analysis={analysis}
                        segment={project.segment}
                        products={initialProducts}
                      />
                      <button
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {locale === 'zh' ? '刷新' : 'Refresh'}
                      </button>
                    </>
                  }
                />
                </div>
                {/* Analysis status */}
                {(isAnalyzing || analysisError) && (
                  <div className="flex items-center gap-3">
                    {isAnalyzing && (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-slate-800" />
                        <p className="text-xs text-slate-500">{t('compare.analyzing')}</p>
                      </>
                    )}
                    {analysisError && <p className="text-xs text-red-500">{analysisError}</p>}
                  </div>
                )}
              </>
            ) : !showTable ? (
              /* Empty state: paste image (primary) + manual input (secondary) */
              <div className="relative py-16">
                <div className="flex flex-col items-center gap-4 mx-auto" style={{ maxWidth: '240px' }}>
                  {/* Primary: "粘贴图片" — large dark button */}
                  <SmartPaste
                    onParsed={handleParsedProducts}
                    variant="large"
                    projectId={projectId}
                    footerLeft={<ModelSelector settings={aiSettings} onSettingsChange={setAiSettings} compact />}
                  />
                  {/* Secondary: "输入参数" — text-only parse dialog (no AI) */}
                  <TextParseDialog
                    onParsed={handleParsedProducts}
                    onManualInput={() => setShowTable(true)}
                    projectId={projectId}
                  />
                </div>
              </div>
            ) : (
              /* Manual input: show empty table */
              <ParamTable
                projectId={projectId}
                initialProducts={initialProducts.length > 0 ? initialProducts : undefined}
                onSave={handleParamTableSave}
                smartPasteFooterLeft={<ModelSelector settings={aiSettings} onSettingsChange={setAiSettings} compact />}
              />
            )}
          </div>
        )}

        {/* SP tab content */}
        {activeTab === 'ksp' && spStatus !== 'locked' && (
          <div className="space-y-4">
            {/* Deep Research — animated entry point */}
            {researchReport ? (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-green-50/60 border border-green-200 rounded-xl animate-in fade-in slide-in-from-top-2 duration-500">
                <Search className="h-4 w-4 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-green-800">
                    {locale === 'zh' ? '已加载调研报告 — 分级结果将参考市场情报' : 'Research report loaded — tiering informed by market intel'}
                  </p>
                  <p className="text-[11px] text-green-600 truncate mt-0.5">{researchReport.summary.slice(0, 80)}...</p>
                </div>
                <Link
                  href="/research"
                  className="text-xs text-green-700 hover:text-green-800 font-medium underline flex-shrink-0"
                >
                  {locale === 'zh' ? '查看全部' : 'View all'}
                </Link>
              </div>
            ) : (
              <Link
                href="/research"
                className="group relative flex items-center gap-4 px-5 py-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-slate-50 hover:from-blue-100 hover:to-blue-50 hover:border-blue-300 transition-all duration-300 hover:shadow-md animate-in fade-in slide-in-from-top-3 duration-700"
              >
                {/* Animated pulse ring */}
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping" />
                  <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                    <Search className="h-5 w-5 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-800 transition-colors">
                    Deep Research
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {locale === 'zh'
                      ? '在分级前，先了解用户评论、竞品话术、市场趋势 — 让 AI 帮你做更准确的决策'
                      : 'Before tiering, understand reviews, competitor messaging, trends — make smarter decisions'}
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-blue-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all duration-200 flex-shrink-0" />
              </Link>
            )}

            <div ref={spExportRef}>
            <TierBoard
              items={spItems}
              unrankedItems={unrankedItems}
              onItemsChange={setSpItems}
              onUnrankedChange={setUnrankedItems}
              onGenerateKsp={() => {
                lastAnalysisSpHashRef.current = '';
                runAnalysisAndKsp(paramsHash);
              }}
              isGenerating={isAnalyzing}
              onDeleteItem={handleDeleteSpItem}
              projectId={projectId}
              extraButtons={
                <>
                  <SpVersionButtons
                    projectId={projectId}
                    items={spItems}
                    onLoadVersion={setSpItems}
                    locale={locale}
                  />
                  <ExportDropdown
                    targetRef={spExportRef}
                    filename={`${project.name}-卖点分级.png`}
                    projectName={project.name}
                    activeTab="ksp"
                    spItems={spItems}
                    analysis={analysis}
                    segment={project.segment}
                    products={initialProducts}
                  />
                </>
              }
            />
            </div>
            {spItems.length === 0 && (
              <Card className="mt-4">
                <CardContent className="flex flex-col items-center justify-center py-16 text-slate-400">
                  {isAnalyzing ? (
                    <Loader2 className="h-10 w-10 mb-4 animate-spin text-slate-800" />
                  ) : (
                    <Sparkles className="h-10 w-10 mb-4" />
                  )}
                  <p className="text-sm">
                    {isAnalyzing
                      ? (locale === 'zh' ? '正在生成卖点分级...' : 'Generating SP tiering...')
                      : (locale === 'zh' ? '等待参数对比生成...' : 'Waiting for generation...')}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Packaging tab content */}
        {activeTab === 'packaging' && packagingStatus !== 'locked' && (
          <div>
            <div ref={packagingExportRef}>
            <PackagingView
              items={spItems}
              onGenerate={spItems.length > 0 ? handleGeneratePackaging : undefined}
              onItemUpdate={handleItemUpdate}
              onDeleteItem={handleDeleteSpItem}
              onSelectItem={setSelectedPackagingItem}
              isGenerating={isGeneratingPackaging}
              extraButtons={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResearchPicker(true)}
                    className="gap-1.5 text-xs"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {locale === 'zh' ? (researchContext ? '已引用调研' : '引用调研') : (researchContext ? 'Research linked' : 'Link Research')}
                    {researchContext && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                  </Button>
                  <ExportDropdown
                    targetRef={packagingExportRef}
                    filename={`${project.name}-卖点包装.png`}
                    projectName={project.name}
                    activeTab="packaging"
                    spItems={spItems}
                    analysis={analysis}
                    segment={project.segment}
                    products={initialProducts}
                  />
                </>
              }
            />
            </div>
            {/* Prompt Architecture Preview (developer tool) */}
            <PromptPreviewPanel
              items={spItems}
              productName={project.products.find(p => p.isOwnProduct)?.name || project.name}
              segment={project.segment}
              competitorContext={analysis ? JSON.stringify(analysis) : undefined}
            />
            {spItems.length === 0 && (
              <Card className="mt-4">
                <CardContent className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Package className="h-10 w-10 mb-4" />
                  <p className="text-sm">{locale === 'zh' ? '请先在"卖点分级"中生成分级结果' : 'Generate SP tiering first'}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Fullscreen packaging detail dialog — resizable */}
        {selectedPackagingItem && (
          <ResizablePackagingDialog
            onClose={() => setSelectedPackagingItem(null)}
          >
            <PackagingDetailView
              item={selectedPackagingItem}
              allItems={spItems.filter(i => i.tier >= 1 && i.l1Name)}
              onBack={() => setSelectedPackagingItem(null)}
              onItemUpdate={handleItemUpdate}
              onNavigate={setSelectedPackagingItem}
              productName={project.products.find(p => p.isOwnProduct)?.name || project.name}
              segment={project.segment}
              competitorContext={analysis ? JSON.stringify(analysis) : undefined}
              projectId={projectId}
              projectContext={buildChatContext()}
              locale={locale}
            />
          </ResizablePackagingDialog>
        )}

      </div>

      {/* Research context picker */}
      <ResearchContextPicker
        open={showResearchPicker}
        onOpenChange={setShowResearchPicker}
        projectId={projectId}
        onConfirm={setResearchContext}
      />

      {/* Positioning dialog — shown before packaging generation */}
      <PositioningDialog
        open={showPositioningDialog}
        onOpenChange={setShowPositioningDialog}
        onConfirm={(pos) => {
          setProductPositioning(pos);
          // Persist packagingStrategy to the project so next time the dialog opens with it preselected,
          // and so the server can fall back to the stored value when packagingStrategy isn't in the body.
          if (pos.packagingStrategy && pos.packagingStrategy !== project?.packagingStrategy) {
            fetch(`/api/projects/${projectId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ packagingStrategy: pos.packagingStrategy }),
            }).catch(() => { /* non-blocking */ });
          }
          generatePackaging(pos);
        }}
        initial={productPositioning || (project ? {
          targetAudience: project.targetAudience || '',
          productStyle: project.productStyle ? (() => { try { return JSON.parse(project.productStyle); } catch { return []; } })() : [],
          positioning: project.positioning || '',
          packagingStrategy: project.packagingStrategy || undefined,
        } : undefined)}
        locale={locale}
        currentProjectId={projectId}
      />

      {/* Chat Sidebar */}
      <ChatSidebar
        projectId={projectId}
        projectContext={buildChatContext()}
      />
    </div>
  );
}
