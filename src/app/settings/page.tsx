'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Save, Check, Eye, EyeOff, Activity, ChevronDown, ChevronUp, Shield, HardDrive, CloudOff, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation, useAppContext } from '@/lib/store';
import { AIProvider, AI_PROVIDER_META, Locale, TaskCategory } from '@/types';
import { loadSettings, saveSettings, AppSettings, TaskRouteConfig } from '@/lib/settings';

const providerKeys = Object.keys(AI_PROVIDER_META) as AIProvider[];

const ACTION_LABELS: Record<string, { en: string; zh: string }> = {
  ai_parse_params: { en: 'Param Recognition', zh: '参数识别' },
  ai_analyze: { en: 'Competitive Analysis', zh: '竞品分析' },
  ai_ksp_tier: { en: 'KSP Grading', zh: '卖点分级' },
  ai_packaging: { en: 'Selling Point Packaging', zh: '卖点包装' },
  ai_agent_orchestration: { en: 'Agent Orchestration', zh: 'Agent 编排' },
  ai_agent_packaging: { en: 'Agent Packaging', zh: 'Agent 包装' },
};

interface UsageLog {
  id: string;
  action: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  creditsUsed: number;
  createdAt: string;
}

interface UsageStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCreditsUsed: number;
}

export default function SettingsPage() {
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';
  const { setLocale } = useAppContext();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<AIProvider>>(new Set());

  // Usage logs
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    // Load usage logs
    setUsageLoading(true);
    fetch('/api/user/usage?limit=50')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.logs)) setUsageLogs(data.logs);
        if (data.stats) setUsageStats(data.stats);
      })
      .catch(() => {})
      .finally(() => setUsageLoading(false));
  }, []);

  if (!settings) return null;

  const handleSave = () => {
    saveSettings(settings);
    setLocale(settings.locale);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateProviderKey = (provider: AIProvider, apiKey: string) => {
    setSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        aiProviders: {
          ...prev.aiProviders,
          [provider]: { ...prev.aiProviders[provider], apiKey },
        },
      };
    });
  };

  const toggleKeyVisibility = (provider: AIProvider) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
        {t('settings.title')}
      </h1>

      {/* Privacy & Data */}
      <PrivacySection settings={settings} setSettings={setSettings} zh={zh} />

      {/* API Keys per provider */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base text-slate-800">
            {t('settings.providerKeys')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {providerKeys.map((provider) => {
            const meta = AI_PROVIDER_META[provider];
            const apiKey = settings.aiProviders[provider]?.apiKey || '';
            const isVisible = visibleKeys.has(provider);
            const isConfigured = !!apiKey;

            return (
              <div key={provider} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-slate-700 font-medium">
                    {meta.label}
                  </Label>
                  {isConfigured ? (
                    <Badge className="bg-green-100 text-green-600 text-[10px] font-normal">
                      ✓
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-400 text-[10px] font-normal">
                      {t('settings.notConfigured')}
                    </Badge>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type={isVisible ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => updateProviderKey(provider, e.target.value)}
                    placeholder="sk-..."
                    className="bg-slate-50/50 focus-visible:ring-slate-300 font-mono text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleKeyVisibility(provider)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Language */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base text-slate-800">
            {t('settings.language')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={settings.locale}
            onValueChange={(val) =>
              setSettings((prev) => prev ? { ...prev, locale: val as Locale } : prev)
            }
          >
            <SelectTrigger className="w-full bg-slate-50/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="zh">中文</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Brand Naming Rules */}
      <BrandNamingRulesSection settings={settings} setSettings={setSettings} zh={zh} />

      {/* Advanced Routing */}
      <RoutingSection settings={settings} setSettings={setSettings} zh={zh} t={t} />

      {/* Save */}
      <Button
        onClick={handleSave}
        className="w-full gap-2 bg-slate-800 hover:bg-slate-900 shadow-sm"
      >
        {saved ? (
          <>
            <Check className="h-4 w-4" />
            {t('settings.saved')}
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            {t('settings.save')}
          </>
        )}
      </Button>

      {/* AI Usage Logs */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base text-slate-800 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            {zh ? 'AI 调用记录' : 'AI Usage Log'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Stats summary */}
          {usageStats && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-[#1e2a3a]">{usageStats.totalCalls}</div>
                <div className="text-[10px] text-slate-500">{zh ? '总调用' : 'Total Calls'}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-[#1e2a3a]">
                  {((usageStats.totalInputTokens + usageStats.totalOutputTokens) / 1000).toFixed(1)}k
                </div>
                <div className="text-[10px] text-slate-500">{zh ? '总 Tokens' : 'Total Tokens'}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-[#1e2a3a]">{usageStats.totalCreditsUsed}</div>
                <div className="text-[10px] text-slate-500">{zh ? '消耗积分' : 'Credits Used'}</div>
              </div>
            </div>
          )}

          {/* Log table */}
          {usageLoading ? (
            <p className="text-xs text-slate-400 text-center py-4">{zh ? '加载中...' : 'Loading...'}</p>
          ) : usageLogs.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">{zh ? '暂无调用记录' : 'No usage logs yet'}</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="text-left py-2 font-medium">{zh ? '步骤' : 'Action'}</th>
                    <th className="text-left py-2 font-medium">{zh ? '模型' : 'Model'}</th>
                    <th className="text-right py-2 font-medium">Tokens</th>
                    <th className="text-right py-2 font-medium">{zh ? '时间' : 'Time'}</th>
                  </tr>
                </thead>
                <tbody>
                  {usageLogs.map(log => (
                    <tr key={log.id} className="border-b border-slate-50">
                      <td className="py-2 text-slate-700">
                        {(zh ? ACTION_LABELS[log.action]?.zh : ACTION_LABELS[log.action]?.en) || log.action}
                      </td>
                      <td className="py-2 text-slate-500 font-space text-[10px]">{log.model}</td>
                      <td className="py-2 text-right text-slate-500">
                        {log.inputTokens + log.outputTokens > 0
                          ? `${log.inputTokens}+${log.outputTokens}`
                          : '-'}
                      </td>
                      <td className="py-2 text-right text-slate-400">
                        {new Date(log.createdAt).toLocaleString(zh ? 'zh-CN' : 'en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Brand Naming Rules Section ──────────────────────────────────

function BrandNamingRulesSection({
  settings,
  setSettings,
  zh,
}: {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
  zh: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [newRule, setNewRule] = useState('');
  const rules = settings.brandNamingRules || [];

  const addRule = () => {
    const trimmed = newRule.trim();
    if (!trimmed) return;
    setSettings(prev => {
      if (!prev) return prev;
      return { ...prev, brandNamingRules: [...(prev.brandNamingRules || []), trimmed] };
    });
    setNewRule('');

    // Also save to DB as KnowledgeEntry (entryType='rule') for packaging-core to pick up
    fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feature: 'brand-naming',
        entryType: 'rule',
        title: trimmed.slice(0, 50),
        content: trimmed,
      }),
    }).catch(() => {});
  };

  const removeRule = (idx: number) => {
    setSettings(prev => {
      if (!prev) return prev;
      const updated = [...(prev.brandNamingRules || [])];
      updated.splice(idx, 1);
      return { ...prev, brandNamingRules: updated };
    });
  };

  return (
    <Card className="bg-white">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <CardTitle className="text-base text-slate-800 flex items-center justify-between">
          <span>{zh ? '品牌命名规则' : 'Brand Naming Rules'}</span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </CardTitle>
        {!open && (
          <p className="text-[11px] text-slate-400 mt-1">
            {zh ? '配置品牌专属命名规则，生成包装时强制引用' : 'Brand-specific naming rules enforced during packaging generation'}
          </p>
        )}
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <p className="text-[11px] text-slate-400">
            {zh
              ? '添加品牌命名规则（如：电池必须叫"泰坦电池"、芯片必须叫"天玑xx"），AI 生成包装时会强制遵守。'
              : 'Add brand naming rules (e.g., battery must be called "Titan Battery"). AI will enforce these during packaging.'}
          </p>

          {/* Existing rules */}
          {rules.length > 0 && (
            <div className="space-y-1.5">
              {rules.map((rule, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-700 flex-1">{rule}</span>
                  <button
                    type="button"
                    onClick={() => removeRule(idx)}
                    className="text-slate-300 hover:text-red-400 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new rule */}
          <div className="flex gap-2">
            <Input
              value={newRule}
              onChange={e => setNewRule(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } }}
              placeholder={zh ? '输入命名规则，如：电池统一叫"泰坦电池"' : 'e.g., Battery must be called "Titan Battery"'}
              className="flex-1 text-sm bg-slate-50/50"
            />
            <Button
              type="button"
              size="sm"
              onClick={addRule}
              disabled={!newRule.trim()}
              className="bg-slate-800 hover:bg-slate-900"
            >
              {zh ? '添加' : 'Add'}
            </Button>
          </div>

          {rules.length === 0 && (
            <p className="text-xs text-slate-300 text-center py-2">
              {zh ? '暂无规则，AI 将自由命名' : 'No rules yet. AI will use free naming.'}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Privacy & Data Section ──────────────────────────────────────

function PrivacySection({
  settings,
  setSettings,
  zh,
}: {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
  zh: boolean;
}) {
  const privacyMode = !!settings.privacyMode;
  const analyticsOptIn = !!settings.analyticsOptIn;

  const toggle = () => {
    setSettings(prev => {
      if (!prev) return prev;
      const next = { ...prev, privacyMode: !prev.privacyMode };
      saveSettings(next);
      return next;
    });
  };

  const toggleAnalytics = () => {
    if (privacyMode) return; // hard-disabled when privacy mode is on
    setSettings(prev => {
      if (!prev) return prev;
      const next = { ...prev, analyticsOptIn: !prev.analyticsOptIn };
      saveSettings(next);
      return next;
    });
  };

  return (
    <Card className="bg-white border-slate-200">
      <CardHeader>
        <CardTitle className="text-base text-slate-800 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          {zh ? '数据与隐私' : 'Data & Privacy'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Privacy mode toggle */}
        <div
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
          className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 cursor-pointer transition-colors"
        >
          <div className={`flex-shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors ${privacyMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${privacyMode ? 'translate-x-4' : ''}`} />
          </div>
          <div className="flex-1 -mt-0.5">
            <div className="text-sm font-medium text-slate-800">
              {zh ? '隐私模式（本地优先）' : 'Privacy mode (local-first)'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              {zh
                ? '开启后，上传的文件、KSP 结果、知识库条目仅存于你的浏览器；AI 调用走你的 API Key 直连模型供应商，不经我们服务器。'
                : 'When on, uploads, KSP results, and knowledge entries stay in your browser; AI calls go direct to providers using your own API key, bypassing our server.'}
            </div>
          </div>
        </div>

        {/* Data flow quick-table */}
        <div className="rounded-lg border border-slate-100 overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
            {zh ? '数据流概览' : 'Data Flow'}
          </div>
          <div className="divide-y divide-slate-100">
            <DataFlowRow
              icon={HardDrive}
              iconColor="text-emerald-600"
              label={zh ? '上传文件 / 知识库 / KSP' : 'Uploads / knowledge / KSP'}
              destination={zh ? '你的浏览器（IndexedDB）' : 'Your browser (IndexedDB)'}
              status={privacyMode ? 'active' : 'pending'}
              statusText={privacyMode ? (zh ? '本地' : 'Local') : (zh ? '即将本地化' : 'Going local soon')}
            />
            <DataFlowRow
              icon={CloudOff}
              iconColor="text-blue-600"
              label={zh ? 'AI 调用' : 'AI calls'}
              destination={zh ? '你的浏览器 → 模型供应商' : 'Your browser → model provider'}
              status={privacyMode ? 'active' : 'pending'}
              statusText={privacyMode ? (zh ? '直连' : 'Direct') : (zh ? '当前经我方代理' : 'Via our proxy for now')}
            />
            <DataFlowRow
              icon={Shield}
              iconColor="text-amber-600"
              label={zh ? 'API Key' : 'API keys'}
              destination={zh ? '本地加密存储' : 'Encrypted locally'}
              status="active"
              statusText={zh ? '已加密' : 'Encrypted'}
            />
          </div>
        </div>

        {/* Warning when privacy mode is on */}
        {privacyMode && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-[11px] text-amber-800 leading-relaxed">
            {zh
              ? '提示：清空浏览器数据会一并清除你的项目。重要内容请定期使用"导出"下载备份。'
              : 'Heads up: clearing browser data will also wipe your projects. Export regularly to back up important work.'}
          </div>
        )}

        {/* Anonymous analytics opt-in */}
        <div
          role="button"
          tabIndex={privacyMode ? -1 : 0}
          aria-disabled={privacyMode}
          onClick={toggleAnalytics}
          onKeyDown={e => { if (!privacyMode && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleAnalytics(); } }}
          className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
            privacyMode
              ? 'border-slate-100 opacity-50 cursor-not-allowed'
              : 'border-slate-200 hover:border-slate-300 cursor-pointer'
          }`}
        >
          <div className={`flex-shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors ${
            !privacyMode && analyticsOptIn ? 'bg-slate-800' : 'bg-slate-200'
          }`}>
            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              !privacyMode && analyticsOptIn ? 'translate-x-4' : ''
            }`} />
          </div>
          <div className="flex-1 -mt-0.5">
            <div className="text-sm font-medium text-slate-800">
              {zh ? '匿名使用统计' : 'Anonymous usage stats'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              {zh
                ? '只发送页面访问和功能触发的计数，不含任何输入内容、文件名或 AI 回答。隐私模式下强制关闭。'
                : 'Only sends page-view and feature-trigger counts. No input content, file names, or AI responses. Auto-disabled in privacy mode.'}
            </div>
          </div>
        </div>

        <Link
          href="/privacy"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
        >
          {zh ? '阅读完整隐私说明' : 'Read full privacy details'}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function DataFlowRow({
  icon: Icon,
  iconColor,
  label,
  destination,
  status,
  statusText,
}: {
  icon: typeof HardDrive;
  iconColor: string;
  label: string;
  destination: string;
  status: 'active' | 'pending';
  statusText: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Icon className={`h-4 w-4 flex-shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-700 truncate">{label}</div>
        <div className="text-[10px] text-slate-400 truncate">{destination}</div>
      </div>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
        status === 'active'
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-slate-50 text-slate-500 border border-slate-200'
      }`}>
        {statusText}
      </span>
    </div>
  );
}

// ─── Advanced Routing Section ────────────────────────────────────

const TASK_CATEGORIES: {
  key: TaskCategory;
  labelKey: string;
  descKey: string;
  recommended: { provider: AIProvider; model: string; label: string }[];
}[] = [
  {
    key: 'light',
    labelKey: 'settings.taskLight',
    descKey: 'settings.taskLightDesc',
    recommended: [
      { provider: 'zhipu', model: 'glm-4-flash', label: '智谱 GLM-4-Flash (免费)' },
    ],
  },
  {
    key: 'analysis',
    labelKey: 'settings.taskAnalysis',
    descKey: 'settings.taskAnalysisDesc',
    recommended: [
      { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { provider: 'zhipu', model: 'glm-4-air', label: '智谱 GLM-4-Air' },
    ],
  },
  {
    key: 'research',
    labelKey: 'settings.taskResearch',
    descKey: 'settings.taskResearchDesc',
    recommended: [
      { provider: 'zhipu', model: 'glm-4-flash', label: '智谱 GLM-4-Flash (免费)' },
      { provider: 'zhipu', model: 'glm-4-air', label: '智谱 GLM-4-Air' },
    ],
  },
  {
    key: 'creative',
    labelKey: 'settings.taskCreative',
    descKey: 'settings.taskCreativeDesc',
    recommended: [
      { provider: 'claude', model: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o' },
      { provider: 'zhipu', model: 'glm-4-plus', label: '智谱 GLM-4-Plus' },
    ],
  },
];

function RoutingSection({
  settings,
  setSettings,
  zh,
  t,
}: {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
  zh: boolean;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);

  // Only show providers that have an API key configured
  const configuredProviders = providerKeys.filter(
    (p) => !!settings.aiProviders[p]?.apiKey
  );

  const updateRouting = (category: TaskCategory, value: string) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const newRouting = { ...prev.taskRouting };
      if (value === 'default') {
        delete newRouting[category];
      } else {
        const provider = value as AIProvider;
        const meta = AI_PROVIDER_META[provider];
        newRouting[category] = {
          provider,
          model: meta?.defaultModel || '',
        };
      }
      return { ...prev, taskRouting: newRouting };
    });
  };

  const updateRoutingModel = (category: TaskCategory, model: string) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const existing = prev.taskRouting?.[category];
      if (!existing) return prev;
      return {
        ...prev,
        taskRouting: {
          ...prev.taskRouting,
          [category]: { ...existing, model },
        },
      };
    });
  };

  return (
    <Card className="bg-white">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <CardTitle className="text-base text-slate-800 flex items-center justify-between">
          <span>{t('settings.advancedRouting')}</span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </CardTitle>
        {!open && (
          <p className="text-[11px] text-slate-400 mt-1">
            {t('settings.routingDescription')}
          </p>
        )}
      </CardHeader>
      {open && (
        <CardContent className="space-y-5">
          <p className="text-[11px] text-slate-400">
            {t('settings.routingDescription')}
          </p>
          {TASK_CATEGORIES.map(({ key, labelKey, descKey, recommended }) => {
            const routing = settings.taskRouting?.[key];
            const selectedProvider = routing?.provider || 'default';
            const selectedModel = routing?.model || '';
            const providerMeta =
              selectedProvider !== 'default'
                ? AI_PROVIDER_META[selectedProvider as AIProvider]
                : null;

            // Filter recommended to only those with configured keys
            const availableRecs = recommended.filter(
              (r) => !!settings.aiProviders[r.provider]?.apiKey
            );

            return (
              <div key={key} className="space-y-2">
                <div>
                  <Label className="text-sm font-medium text-slate-700">
                    {t(labelKey)}
                  </Label>
                  <p className="text-[10px] text-slate-400">{t(descKey)}</p>
                </div>
                {/* Recommended quick picks */}
                {availableRecs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {availableRecs.map((rec) => {
                      const isActive = selectedProvider === rec.provider && selectedModel === rec.model;
                      return (
                        <button
                          key={`${rec.provider}-${rec.model}`}
                          type="button"
                          onClick={() => {
                            setSettings((prev) => {
                              if (!prev) return prev;
                              return {
                                ...prev,
                                taskRouting: {
                                  ...prev.taskRouting,
                                  [key]: { provider: rec.provider, model: rec.model },
                                },
                              };
                            });
                          }}
                          className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                            isActive
                              ? 'bg-[#1e2a3a] text-white border-[#1e2a3a]'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {rec.label} {zh ? '推荐' : '★'}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2">
                  <Select
                    value={selectedProvider}
                    onValueChange={(val) => val && updateRouting(key, val)}
                  >
                    <SelectTrigger className="flex-1 bg-slate-50/50 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        {t('settings.routingDefault')}
                      </SelectItem>
                      {configuredProviders.map((p) => (
                        <SelectItem key={p} value={p}>
                          {AI_PROVIDER_META[p].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {providerMeta && (
                    <Select
                      value={selectedModel || providerMeta.defaultModel}
                      onValueChange={(val) => val && updateRoutingModel(key, val)}
                    >
                      <SelectTrigger className="w-[180px] bg-slate-50/50 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providerMeta.models.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
