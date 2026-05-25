'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Plus, ChevronRight, ChevronDown, Pencil, Trash2, ExternalLink,
  FolderOpen, FileText, Globe, Ruler, X, Check, Loader2, HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from '@/lib/store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { TEMPLATE_DEFAULTS } from '@/lib/constants/template-defaults';
import { PARAM_DISPLAY_NAMES } from '@/lib/analysis/direction-map';
import * as kb from '@/lib/repos/knowledge';

// Common features for brand_name dropdown (sourced from PARAM_DISPLAY_NAMES, deduplicated)
const COMMON_FEATURES_ZH = Array.from(new Set(
  Object.values(PARAM_DISPLAY_NAMES).map(v => v.zh)
)).filter(Boolean);

// ─── Types ─────────────────────────────────────────────────────

interface Template {
  id: string;
  matchFeatures: string[];
  parentName: string;
  parentSlogan: string | null;
  subFeatures: { name: string; fromFeature?: string }[];
}

interface KnowledgeEntry {
  id: string;
  feature: string;
  parentFeature: string | null;
  entryType: string;
  title: string;
  content: string;
  brand: string | null;
  sourceUrl: string | null;
  marketingName: string | null;
  structured: unknown;
  createdAt: string;
}

type TreeNode = {
  feature: string;
  isTemplate: boolean;
  templateId?: string;
  children: string[];
  entryCount: number;
};

// ─── Main Page ─────────────────────────────────────────────────

export default function KnowledgePage() {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  const [templates, setTemplates] = useState<Template[]>([]);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Tree state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);

  // Editor state
  const [editingEntry, setEditingEntry] = useState<Partial<KnowledgeEntry> | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Partial<Template> | null>(null);
  const [saving, setSaving] = useState(false);

  // ─── Data Loading ──────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [tpls, entrs] = await Promise.all([
        kb.listTemplates(),
        kb.listEntries(),
      ]);
      setTemplates(tpls as Template[]);
      setEntries(entrs as KnowledgeEntry[]);
    } catch (err) {
      console.error('Failed to load knowledge data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Tree Building ─────────────────────────────────────────

  const tree: TreeNode[] = [];
  const featureSet = new Set<string>();

  // Templates first
  for (const tpl of templates) {
    const parentKey = tpl.matchFeatures.join('+');
    featureSet.add(parentKey);
    tree.push({
      feature: parentKey,
      isTemplate: true,
      templateId: tpl.id,
      children: tpl.subFeatures.map(sf => sf.name),
      entryCount: entries.filter(e => e.parentFeature && tpl.matchFeatures.includes(e.parentFeature)).length,
    });
    tpl.subFeatures.forEach(sf => featureSet.add(sf.name));
  }

  // Standalone features (entries with no parentFeature and not in any template)
  const templateFeatures = new Set(templates.flatMap(t => t.matchFeatures));
  const templateSubFeatures = new Set(templates.flatMap(t => t.subFeatures.map(sf => sf.name)));
  for (const entry of entries) {
    const f = entry.parentFeature || entry.feature;
    if (!featureSet.has(f) && !templateFeatures.has(f) && !templateSubFeatures.has(f)) {
      featureSet.add(f);
      tree.push({
        feature: f,
        isTemplate: false,
        children: [],
        entryCount: entries.filter(e => e.feature === f || e.parentFeature === f).length,
      });
    }
  }

  const toggleNode = (feature: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(feature)) next.delete(feature); else next.add(feature);
      return next;
    });
  };

  const selectNode = (feature: string, parent: string | null) => {
    setSelectedFeature(feature);
    setSelectedParent(parent);
    setEditingEntry(null);
  };

  // Filtered entries for selected node
  const filteredEntries = selectedFeature
    ? entries.filter(e => {
        if (selectedParent) {
          // Clicking a sub-feature: show entries for this specific sub-feature
          return e.feature === selectedFeature;
        }
        // Clicking a parent: show all entries under this parent
        const tpl = templates.find(t => t.matchFeatures.join('+') === selectedFeature);
        if (tpl) {
          return tpl.matchFeatures.includes(e.feature) ||
                 tpl.matchFeatures.includes(e.parentFeature || '') ||
                 tpl.subFeatures.some(sf => sf.name === e.feature);
        }
        return e.feature === selectedFeature || e.parentFeature === selectedFeature;
      })
    : entries;

  // ─── Template CRUD ─────────────────────────────────────────

  const startNewTemplate = () => {
    const defaults = TEMPLATE_DEFAULTS['电池+快充'];
    setEditingTemplate({
      matchFeatures: defaults.matchFeatures.slice(0, 2),
      parentName: defaults.parentNameHint,
      parentSlogan: '',
      subFeatures: defaults.subFeatures.map(sf => ({ name: sf.name })),
    });
  };

  const saveTemplate = async () => {
    if (!editingTemplate) return;
    setSaving(true);
    try {
      await kb.saveTemplate(editingTemplate as kb.TemplateInput);
      toast.success(zh ? '模板已保存' : 'Template saved');
      setEditingTemplate(null);
      loadData();
    } catch {
      toast.error(zh ? '保存失败' : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await kb.deleteTemplate(id);
      toast.success(zh ? '已删除' : 'Deleted');
      loadData();
    } catch {
      toast.error(zh ? '删除失败' : 'Delete failed');
    }
  };

  // ─── Entry CRUD ────────────────────────────────────────────

  const startNewEntry = (type?: string) => {
    // Only brand_name is creatable via UI now. Other types (packaging / competitor /
    // rule) can still be auto-created from elsewhere (e.g. PackagingView save-to-KB),
    // but the manual ADD form is brand_name-only.
    setEditingEntry({
      feature: selectedFeature || '',
      parentFeature: selectedParent,
      entryType: type || 'brand_name',
      title: '',
      content: '',
      brand: '',
      sourceUrl: '',
      marketingName: '',
    });
  };

  const saveEntry = async () => {
    if (!editingEntry) return;

    // brand_name validation + auto-sync title to marketingName for list display
    let payload = editingEntry;
    if (editingEntry.entryType === 'brand_name') {
      if (!editingEntry.feature || !editingEntry.marketingName) {
        toast.error(zh ? '功能名和营销名都必填' : 'Feature and marketing name are required');
        return;
      }
      payload = {
        ...editingEntry,
        title: editingEntry.marketingName,  // keep title in sync for list display
        content: editingEntry.content || '',  // notes (optional)
      };
    }

    setSaving(true);
    try {
      await kb.saveEntry(payload as kb.KnowledgeEntryInput);
      toast.success(zh ? '已保存' : 'Saved');
      setEditingEntry(null);
      loadData();
    } catch {
      toast.error(zh ? '保存失败' : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      await kb.deleteEntry(id);
      toast.success(zh ? '已删除' : 'Deleted');
      loadData();
    } catch {
      toast.error(zh ? '删除失败' : 'Delete failed');
    }
  };

  // ─── Entry Type Config ─────────────────────────────────────

  const entryTypeConfig: Record<string, { label: string; icon: typeof FileText; color: string }> = {
    packaging: { label: zh ? '包装模板' : 'Packaging Template', icon: FileText, color: 'bg-blue-50 text-blue-600' },
    competitor: { label: zh ? '竞品参考' : 'Competitor', icon: Globe, color: 'bg-amber-50 text-amber-600' },
    rule: { label: zh ? '品牌规则' : 'Brand Rule', icon: Ruler, color: 'bg-purple-50 text-purple-600' },
    brand_name: { label: zh ? '品牌营销名' : 'Brand Name', icon: BookOpen, color: 'bg-green-50 text-green-600' },
  };

  // ─── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          {zh ? '知识库' : 'Knowledge Base'}
        </h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={startNewTemplate} className="text-xs gap-1">
            <Plus className="h-3 w-3" />
            {zh ? '卖点模板' : 'Template'}
          </Button>
          <Button size="sm" onClick={() => startNewEntry()} className="text-xs gap-1 bg-slate-800 hover:bg-slate-900">
            <Plus className="h-3 w-3" />
            {zh ? '添加知识' : 'Add Entry'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[260px_1fr] gap-4 min-h-[500px]">
        {/* ═══ Left: Feature Tree ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-180px)]">
          {tree.length === 0 && !editingTemplate && (
            <div className="text-center py-12 text-slate-400">
              <FolderOpen className="h-8 w-8 mx-auto mb-2" />
              <p className="text-xs">{zh ? '暂无品牌营销名' : 'No brand names yet'}</p>
              <p className="text-[10px] mt-1">{zh ? '点右上"添加"录入品牌营销名' : 'Click "Add" to register a brand name'}</p>
            </div>
          )}

          {/* All node */}
          <button
            onClick={() => { setSelectedFeature(null); setSelectedParent(null); setEditingEntry(null); }}
            className={cn(
              'w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors',
              !selectedFeature ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            {zh ? '全部' : 'All'} ({entries.length})
          </button>

          {tree.map(node => {
            const isExpanded = expandedNodes.has(node.feature);
            const isSelected = selectedFeature === node.feature && !selectedParent;
            const tpl = node.isTemplate ? templates.find(t => t.id === node.templateId) : null;

            return (
              <div key={node.feature}>
                <div className="flex items-center group">
                  <button
                    onClick={() => node.children.length > 0 ? toggleNode(node.feature) : null}
                    className="w-4 h-4 flex items-center justify-center flex-shrink-0"
                  >
                    {node.children.length > 0 && (
                      isExpanded
                        ? <ChevronDown className="h-3 w-3 text-slate-400" />
                        : <ChevronRight className="h-3 w-3 text-slate-400" />
                    )}
                  </button>
                  <button
                    onClick={() => selectNode(node.feature, null)}
                    className={cn(
                      'flex-1 text-left px-2 py-1.5 rounded text-xs transition-colors truncate',
                      isSelected ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    {node.isTemplate && <span className="mr-1">📦</span>}
                    {tpl ? tpl.parentName : node.feature}
                    {node.entryCount > 0 && (
                      <span className="text-[10px] text-slate-400 ml-1">({node.entryCount})</span>
                    )}
                  </button>
                  {node.isTemplate && (
                    <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 mr-1">
                      <button
                        onClick={() => tpl && setEditingTemplate(tpl)}
                        className="p-0.5 text-slate-300 hover:text-slate-600"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => tpl && deleteTemplate(tpl.id)}
                        className="p-0.5 text-slate-300 hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Sub-features */}
                {isExpanded && node.children.map(child => {
                  const childSelected = selectedFeature === child && selectedParent === node.feature;
                  const childCount = entries.filter(e => e.feature === child).length;
                  return (
                    <button
                      key={child}
                      onClick={() => selectNode(child, node.feature)}
                      className={cn(
                        'w-full text-left pl-8 pr-2 py-1.5 rounded text-xs transition-colors truncate',
                        childSelected ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-500 hover:bg-slate-50'
                      )}
                    >
                      {child}
                      {childCount > 0 && <span className="text-[10px] text-slate-400 ml-1">({childCount})</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ═══ Right: Content Panel ═══ */}
        <div className="space-y-3">
          {/* Template Editor */}
          {editingTemplate && (
            <Card className="border-purple-200 bg-purple-50/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-purple-700">
                    {editingTemplate.id ? (zh ? '编辑模板' : 'Edit Template') : (zh ? '新建卖点模板' : 'New Template')}
                  </h3>
                  <button onClick={() => setEditingTemplate(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">{zh ? '匹配参数名（逗号分隔）' : 'Match Features'}</label>
                    <input
                      value={(editingTemplate.matchFeatures || []).join(', ')}
                      onChange={e => setEditingTemplate(prev => ({
                        ...prev,
                        matchFeatures: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
                      }))}
                      className="w-full h-8 px-2 text-xs border rounded-md"
                      placeholder="电池, 快充"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">{zh ? '父卖点营销名' : 'Parent Name'}</label>
                    <input
                      value={editingTemplate.parentName || ''}
                      onChange={e => setEditingTemplate(prev => ({ ...prev, parentName: e.target.value }))}
                      className="w-full h-8 px-2 text-xs border rounded-md"
                      placeholder="8000mAh Titan Battery + 45W Fast Charge"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">{zh ? '总 Slogan' : 'Parent Slogan'}</label>
                  <input
                    value={editingTemplate.parentSlogan || ''}
                    onChange={e => setEditingTemplate(prev => ({ ...prev, parentSlogan: e.target.value }))}
                    className="w-full h-8 px-2 text-xs border rounded-md"
                    placeholder="Segment's Biggest Capacity, realme Flagship Titan Battery Longevity"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-slate-500">{zh ? '子卖点（可增删）' : 'Sub-features'}</label>
                    <button
                      onClick={() => setEditingTemplate(prev => ({
                        ...prev,
                        subFeatures: [...(prev?.subFeatures || []), { name: '' }],
                      }))}
                      className="text-[10px] text-purple-600 hover:text-purple-800 flex items-center gap-0.5"
                    >
                      <Plus className="h-3 w-3" /> {zh ? '添加' : 'Add'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(editingTemplate.subFeatures || []).map((sf, idx) => (
                      <div key={idx} className="flex items-center gap-1 bg-white border rounded-md px-2 py-1">
                        <input
                          value={sf.name}
                          onChange={e => {
                            const next = [...(editingTemplate.subFeatures || [])];
                            next[idx] = { ...next[idx], name: e.target.value };
                            setEditingTemplate(prev => ({ ...prev, subFeatures: next }));
                          }}
                          className="w-20 text-xs border-none outline-none bg-transparent"
                          placeholder={zh ? '子卖点名' : 'Name'}
                        />
                        <button
                          onClick={() => {
                            const next = (editingTemplate.subFeatures || []).filter((_, i) => i !== idx);
                            setEditingTemplate(prev => ({ ...prev, subFeatures: next }));
                          }}
                          className="text-slate-300 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setEditingTemplate(null)} className="text-xs h-7">
                    {zh ? '取消' : 'Cancel'}
                  </Button>
                  <Button size="sm" onClick={saveTemplate} disabled={saving} className="text-xs h-7 bg-purple-600 hover:bg-purple-700 gap-1">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    {zh ? '保存模板' : 'Save Template'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entry Editor */}
          {editingEntry && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-blue-700">
                    {editingEntry.id ? (zh ? '编辑知识' : 'Edit Entry') : (zh ? '添加知识' : 'New Entry')}
                  </h3>
                  <button onClick={() => setEditingEntry(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Type selector — only shown when editing an existing non-brand_name entry.
                    New entries default to brand_name (the only manually-creatable type). */}
                {editingEntry.id && editingEntry.entryType !== 'brand_name' && (
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">{zh ? '类型' : 'Type'}</label>
                    <div className="px-2 py-1.5 text-xs bg-slate-100 rounded-md text-slate-600">
                      {editingEntry.entryType === 'packaging' ? (zh ? '包装模板（自动生成，不可手动新建）' : 'Packaging template (auto-generated)')
                        : editingEntry.entryType === 'competitor' ? (zh ? '竞品参考' : 'Competitor')
                        : editingEntry.entryType === 'rule' ? (zh ? '品牌规则' : 'Brand Rule')
                        : editingEntry.entryType}
                    </div>
                  </div>
                )}

                {/* ─── brand_name 类型：简化结构化表单 ─── */}
                {editingEntry.entryType === 'brand_name' ? (
                  <>
                    {/* Help tooltip */}
                    <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
                      <HelpCircle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-[10px] text-amber-800 leading-relaxed">
                        {zh ? (
                          <>
                            <b>品牌营销名</b>是品牌为某类参数固定使用的命名风格。
                            例如华为相机统一叫"超感光主摄"，OPPO 电池叫"长寿版电池"。
                            填写后，该名称会出现在所有相关产品的 L1 卖点命名中，<u>前面的参数数值会随产品自动变化</u>。
                          </>
                        ) : (
                          <>
                            <b>Brand Marketing Name</b> is a fixed naming style a brand uses for a feature.
                            E.g. Huawei calls all cameras "Ultra-Sensing", OPPO calls batteries "Endurance Edition".
                            Once set, it appears in the L1 of every related product — only the parameter value before it changes.
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Feature dropdown */}
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">
                          {zh ? '功能 / 卖点类型' : 'Feature'} <span className="text-red-500">*</span>
                        </label>
                        <input
                          list="brand-name-features"
                          value={editingEntry.feature || ''}
                          onChange={e => setEditingEntry(prev => ({ ...prev, feature: e.target.value }))}
                          className="w-full h-8 px-2 text-xs border rounded-md bg-white"
                          placeholder={zh ? '例如：电池、影像、芯片' : 'e.g., Battery, Camera, Chip'}
                        />
                        <datalist id="brand-name-features">
                          {COMMON_FEATURES_ZH.map(f => <option key={f} value={f} />)}
                        </datalist>
                      </div>

                      {/* Marketing Name */}
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">
                          {zh ? '品牌营销名' : 'Marketing Name'} <span className="text-red-500">*</span>
                        </label>
                        <input
                          value={editingEntry.marketingName || ''}
                          onChange={e => setEditingEntry(prev => ({ ...prev, marketingName: e.target.value }))}
                          className="w-full h-8 px-2 text-xs border rounded-md"
                          placeholder={zh ? '例如：青海湖电池' : 'e.g., Titan Battery'}
                        />
                      </div>
                    </div>

                    {/* Live preview */}
                    {editingEntry.feature && editingEntry.marketingName && (
                      <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
                        <div className="text-[10px] text-slate-500 mb-1">
                          {zh ? 'L1 命名预览（参数会随产品自动替换）' : 'L1 preview (parameter will vary per product)'}
                        </div>
                        <div className="font-mono text-xs text-slate-800">
                          <span className="text-blue-600">[参数]</span> <span className="font-medium">{editingEntry.marketingName}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {zh ? '例如：' : 'e.g., '}
                          <span className="font-mono">7000mAh {editingEntry.marketingName}</span>
                          {' · '}
                          <span className="font-mono">5800mAh {editingEntry.marketingName}</span>
                        </div>
                      </div>
                    )}

                  </>
                ) : (
                  /* ─── 其他类型：原始 freeform 表单 ─── */
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">{zh ? '卖点/参数名' : 'Feature'}</label>
                        <input
                          value={editingEntry.feature || ''}
                          onChange={e => setEditingEntry(prev => ({ ...prev, feature: e.target.value }))}
                          className="w-full h-8 px-2 text-xs border rounded-md"
                          placeholder={zh ? '例如：续航' : 'e.g., Battery Life'}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">{zh ? '父卖点（可空）' : 'Parent Feature'}</label>
                        <input
                          value={editingEntry.parentFeature || ''}
                          onChange={e => setEditingEntry(prev => ({ ...prev, parentFeature: e.target.value || null }))}
                          className="w-full h-8 px-2 text-xs border rounded-md"
                          placeholder={zh ? '例如：电池' : 'e.g., Battery'}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">{zh ? '标题' : 'Title'}</label>
                        <input
                          value={editingEntry.title || ''}
                          onChange={e => setEditingEntry(prev => ({ ...prev, title: e.target.value }))}
                          className="w-full h-8 px-2 text-xs border rounded-md"
                          placeholder={zh ? '例如：realme P4r 续航包装' : 'Title'}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">{zh ? '品牌' : 'Brand'}</label>
                        <input
                          value={editingEntry.brand || ''}
                          onChange={e => setEditingEntry(prev => ({ ...prev, brand: e.target.value }))}
                          className="w-full h-8 px-2 text-xs border rounded-md"
                          placeholder="realme"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">{zh ? '来源 URL' : 'Source URL'}</label>
                        <input
                          value={editingEntry.sourceUrl || ''}
                          onChange={e => setEditingEntry(prev => ({ ...prev, sourceUrl: e.target.value }))}
                          className="w-full h-8 px-2 text-xs border rounded-md"
                          placeholder="https://..."
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 mb-1 block">{zh ? '内容' : 'Content'}</label>
                      <textarea
                        value={editingEntry.content || ''}
                        onChange={e => setEditingEntry(prev => ({ ...prev, content: e.target.value }))}
                        rows={4}
                        className="w-full px-2 py-1.5 text-xs border rounded-md resize-y"
                        placeholder={
                          editingEntry.entryType === 'packaging'
                            ? (zh ? '输入包装模板，如 L3 拆解维度：续航/长寿/轻薄/安全...' : 'Packaging template, e.g. L3 dimensions: endurance/longevity/slim/safety...')
                            : editingEntry.entryType === 'rule'
                            ? (zh ? '输入品牌规则，如"禁止使用极限词"、"电池必须强调安全认证"' : 'Brand rule, e.g. "No superlatives unless verified"')
                            : (zh ? '粘贴竞品文案或参考内容...' : 'Paste competitor copy or reference...')
                        }
                      />
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setEditingEntry(null)} className="text-xs h-7">
                    {zh ? '取消' : 'Cancel'}
                  </Button>
                  <Button size="sm" onClick={saveEntry} disabled={saving} className="text-xs h-7 bg-slate-800 hover:bg-slate-900 gap-1">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    {zh ? '保存' : 'Save'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entry List */}
          <div className="space-y-2">
            {selectedFeature && (
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-700">
                  {selectedParent ? `${selectedParent} / ${selectedFeature}` : selectedFeature}
                </h2>
                <Button size="sm" variant="outline" onClick={() => startNewEntry()} className="text-xs h-7 gap-1">
                  <Plus className="h-3 w-3" />
                  {zh ? '添加' : 'Add'}
                </Button>
              </div>
            )}

            {filteredEntries.length === 0 && !editingEntry && !editingTemplate && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <BookOpen className="h-8 w-8 mb-3" />
                  <p className="text-sm">{zh ? '暂无知识条目' : 'No entries yet'}</p>
                  <p className="text-xs mt-1 text-slate-300">
                    {zh ? '点击"添加知识"录入自家包装或竞品参考' : 'Click "Add Entry" to add packaging or competitor references'}
                  </p>
                </CardContent>
              </Card>
            )}

            {filteredEntries.map(entry => {
              const typeConf = entryTypeConfig[entry.entryType] || entryTypeConfig.packaging;
              const TypeIcon = typeConf.icon;
              return (
                <Card key={entry.id} className="group hover:shadow-sm transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={cn('text-[9px] px-1.5 py-0 gap-1', typeConf.color)}>
                            <TypeIcon className="h-2.5 w-2.5" />
                            {typeConf.label}
                          </Badge>
                          {entry.brand && (
                            <span className="text-[10px] text-slate-400">{entry.brand}</span>
                          )}
                          <span className="text-[10px] text-slate-300">
                            {entry.feature}
                            {entry.parentFeature && ` / ${entry.parentFeature}`}
                          </span>
                        </div>
                        <h4 className="text-xs font-medium text-slate-800 truncate">{entry.title}</h4>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{entry.content}</p>
                        {entry.sourceUrl && (
                          <a
                            href={entry.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5 mt-1"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            {new URL(entry.sourceUrl).hostname}
                          </a>
                        )}
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        <button
                          onClick={() => setEditingEntry(entry)}
                          className="p-1 text-slate-300 hover:text-slate-600"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          className="p-1 text-slate-300 hover:text-red-500"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
