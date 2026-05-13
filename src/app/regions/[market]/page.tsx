'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FolderOpen, Trash2, Package, CheckCircle2, Eye, EyeOff, Plus, Pencil, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/store';
import { cn } from '@/lib/utils';
import { cachedFetch, invalidateCache } from '@/lib/utils/fetch-cache';

// ─── Types ───────────────────────────────────────────────────

interface ProjectSummary {
  id: string;
  name: string;
  segment?: string;
  market?: string;
  launched: boolean;
  launchDate?: string;
  createdAt: string;
  _count: { products: number };
}

// ─── Helpers ─────────────────────────────────────────────────

function getSegmentGroup(segment?: string): string {
  if (!segment) return 'other';
  const num = parseInt(segment.replace(/[^0-9]/g, ''), 10);
  if (isNaN(num)) return 'other';
  const tier = Math.floor(num / 5000) * 5000;
  return String(tier);
}

function getSegmentLabel(group: string): string {
  if (group === 'other') return '?';
  return parseInt(group, 10).toLocaleString();
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  if (d.getFullYear() !== now.getFullYear()) {
    return `${d.getFullYear()}.${month}`;
  }
  return `${month}.${day}`;
}

function toInputDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

// ─── Editable Y-axis tick ────────────────────────────────────

function SegmentTick({ group, zh, onSave }: { group: string; zh: boolean; onSave: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group === 'other' ? '' : group);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== group) onSave(trimmed);
    else setDraft(group === 'other' ? '' : group);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(group === 'other' ? '' : group); setEditing(false); } }}
        className="w-full text-xs font-bold text-slate-700 bg-white border border-blue-300 rounded px-1 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-blue-200 tabular-nums"
        placeholder="15000"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(group === 'other' ? '' : group); setEditing(true); }}
      className="text-xs font-bold text-slate-600 tabular-nums hover:text-blue-600 hover:underline transition-colors cursor-text"
      title={zh ? '点击编辑价位段' : 'Click to edit segment'}
    >
      {getSegmentLabel(group)}
    </button>
  );
}

// ─── Component ───────────────────────────────────────────────

export default function MarketProjectsPage() {
  const { locale } = useTranslation();
  const params = useParams();
  const market = decodeURIComponent(params.market as string);
  const zh = locale === 'zh';

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideLaunched, setHideLaunched] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [editName, setEditName] = useState('');
  const [editSegment, setEditSegment] = useState('');
  const [editLaunchDate, setEditLaunchDate] = useState('');

  useEffect(() => {
    cachedFetch<ProjectSummary[]>('/api/projects')
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setProjects(arr.filter((p: ProjectSummary) => p.market === market));
        setLoading(false);
      })
      .catch((err) => { console.error(err); setLoading(false); });
  }, [market]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm(zh ? '确定删除此项目？' : 'Delete this project?')) return;
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      invalidateCache('/api/projects');
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) { console.error(err); }
  };

  const toggleLaunched = async (e: React.MouseEvent, id: string, current: boolean) => {
    e.preventDefault(); e.stopPropagation();
    try {
      await fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ launched: !current }) });
      setProjects(prev => prev.map(p => (p.id === id ? { ...p, launched: !current } : p)));
    } catch (err) { console.error(err); }
  };

  const openEditDialog = (e: React.MouseEvent, project: ProjectSummary) => {
    e.preventDefault(); e.stopPropagation();
    setEditingProject(project); setEditName(project.name); setEditSegment(project.segment || ''); setEditLaunchDate(toInputDate(project.launchDate)); setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingProject || !editName.trim()) return;
    try {
      await fetch(`/api/projects/${editingProject.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editName.trim(), segment: editSegment.trim() || null, launchDate: editLaunchDate ? new Date(editLaunchDate).toISOString() : null }) });
      setProjects(prev => prev.map(p => p.id === editingProject.id ? { ...p, name: editName.trim(), segment: editSegment.trim() || undefined, launchDate: editLaunchDate ? new Date(editLaunchDate).toISOString() : undefined } : p));
      setEditDialogOpen(false);
    } catch (err) { console.error(err); }
  };

  const filteredProjects = useMemo(() => hideLaunched ? projects.filter(p => !p.launched) : projects, [projects, hideLaunched]);

  // Group by segment, sort tiers descending (high price at top = top of visual), within each tier sort by date ascending
  const groupedProjects = useMemo(() => {
    const groups = new Map<string, ProjectSummary[]>();
    filteredProjects.forEach(p => {
      const g = getSegmentGroup(p.segment);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(p);
    });
    for (const [, items] of groups) {
      items.sort((a, b) => {
        const aD = a.launchDate ? new Date(a.launchDate).getTime() : Infinity;
        const bD = b.launchDate ? new Date(b.launchDate).getTime() : Infinity;
        return aD - bD;
      });
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'other') return 1;
      if (b === 'other') return -1;
      return parseInt(b, 10) - parseInt(a, 10);
    });
  }, [filteredProjects]);

  const launchedCount = projects.filter(p => p.launched).length;

  if (loading) return <div className="max-w-6xl mx-auto py-12 text-center text-slate-400">{zh ? '加载中...' : 'Loading...'}</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link href="/regions" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        {zh ? '所属战区' : 'Regions'}
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{market}</h1>
        <div className="flex items-center gap-3">
          {launchedCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => setHideLaunched(!hideLaunched)} className={`gap-2 text-xs ${hideLaunched ? 'bg-slate-100' : ''}`}>
              {hideLaunched ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {hideLaunched ? (zh ? '显示已上市' : 'Show launched') : (zh ? '隐藏已上市' : 'Hide launched')}
              <span className="text-slate-400">({launchedCount})</span>
            </Button>
          )}
          <Link href={`/projects/new?market=${encodeURIComponent(market)}`}>
            <Button size="sm" className="gap-2 bg-slate-800 hover:bg-slate-900">
              <Plus className="h-3.5 w-3.5" />
              {zh ? '新建项目' : 'New Project'}
            </Button>
          </Link>
        </div>
      </div>

      {/* ─── Coordinate-axis grid ─────────────────────────────── */}
      {filteredProjects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-slate-400">
            <FolderOpen className="h-12 w-12 mb-4" />
            <p className="text-sm">{hideLaunched ? (zh ? '所有项目都已上市' : 'All projects are launched') : (zh ? '暂无项目' : 'No projects yet')}</p>
          </CardContent>
        </Card>
      ) : (
        /* Coordinate-axis layout: fixed L-shaped axes, cards inside */
        <div className="relative min-h-[calc(100vh-14rem)]">
          {/* ─── Y-axis: fixed left vertical line ─── */}
          <div className="absolute left-0 top-0 bottom-8 w-[3px] bg-slate-700 z-10" />
          {/* Y-axis arrow (top) */}
          <svg width="9" height="7" viewBox="0 0 9 7" className="absolute left-[-3px] top-[-7px] z-10">
            <path d="M4.5 0 L9 7 L0 7 Z" fill="#334155" />
          </svg>
          {/* Y-axis label */}
          <span className="absolute left-1 top-[-24px] text-[10px] text-slate-500 font-medium">
            {zh ? '价位段' : 'Segment'}
          </span>

          {/* ─── X-axis: fixed bottom horizontal line ─── */}
          <div className="absolute left-0 bottom-8 right-4 h-[3px] bg-slate-700 z-10" />
          {/* X-axis arrow (right) */}
          <svg width="7" height="9" viewBox="0 0 7 9" className="absolute right-[-3px] z-10" style={{ bottom: 28 }}>
            <path d="M0 0 L7 4.5 L0 9 Z" fill="#334155" />
          </svg>
          {/* X-axis label */}
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 font-medium">
            {zh ? '上市时间' : 'Launch Date'}
          </span>

          {/* ─── Content area: inside the L-shaped axes ─── */}
          <div className="ml-5 pb-14">
            {groupedProjects.map(([group, items]) => (
              <div key={group} className="flex items-stretch min-h-[6rem]">
                {/* Y-axis tick label */}
                <div className="w-14 flex-shrink-0 flex items-center justify-end pr-2 relative">
                  <SegmentTick group={group} zh={zh} onSave={(newSegment) => {
                    items.forEach(async (p) => { try { await fetch(`/api/projects/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segment: newSegment }) }); } catch {} });
                    setProjects(prev => prev.map(p => items.some(i => i.id === p.id) ? { ...p, segment: newSegment } : p));
                  }} />
                  {/* Tick mark crossing the Y-axis line */}
                  <div className="absolute -left-[17px] top-1/2 w-3 h-[2px] bg-slate-600" />
                </div>

                {/* Row: cards */}
                <div className="flex-1 pl-3 py-2">
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {items.map((project) => {
                      const hasDate = !!project.launchDate;
                      return (
                        <Link key={project.id} href={`/projects/${project.id}`} className="flex-shrink-0">
                          <div className={cn(
                            'group relative rounded-lg cursor-pointer transition-all hover:shadow-lg w-36',
                            'border-2 border-amber-400 bg-white',
                            !hasDate && 'border-dashed border-amber-300 bg-amber-50/30',
                            project.launched && 'opacity-50 hover:opacity-75'
                          )}>
                            <div className="px-3 pt-2.5 pb-2">
                              <div className="flex items-start justify-between">
                                <h3 className="text-sm font-bold text-slate-800 truncate flex-1">{project.name}</h3>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                                  <button onClick={(e) => toggleLaunched(e, project.id, project.launched)} className="text-slate-300 hover:text-green-500 p-0.5">
                                    <CheckCircle2 className={cn('h-3 w-3', project.launched && 'text-green-500 opacity-100')} />
                                  </button>
                                  <button onClick={(e) => openEditDialog(e, project)} className="text-slate-300 hover:text-slate-700 p-0.5">
                                    <Pencil className="h-2.5 w-2.5" />
                                  </button>
                                  <button onClick={(e) => handleDelete(e, project.id)} className="text-slate-300 hover:text-red-500 p-0.5">
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                {project.segment && (
                                  <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                                    ¥{parseInt(project.segment).toLocaleString()}
                                  </span>
                                )}
                                <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                                  <Package className="h-2.5 w-2.5" />
                                  {project._count.products}
                                </span>
                              </div>
                              <div className="mt-1.5">
                                {hasDate ? (
                                  <span className="text-[11px] font-semibold text-slate-600 tabular-nums">{formatShortDate(project.launchDate!)}</span>
                                ) : (
                                  <span className="text-[10px] text-slate-300">—</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{zh ? '编辑项目' : 'Edit Project'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-slate-700">{zh ? '项目名称' : 'Project Name'}</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEditSave()} autoFocus />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">{zh ? '价位段' : 'Segment'}</Label>
              <Input value={editSegment} onChange={e => setEditSegment(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEditSave()} placeholder={zh ? '如：15000' : 'e.g. 15000'} />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">
                {zh ? '上市时间' : 'Launch Date'}
                <span className="text-slate-400 text-xs ml-1">({zh ? '选填' : 'optional'})</span>
              </Label>
              <Input type="date" value={editLaunchDate} onChange={e => setEditLaunchDate(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleEditSave} disabled={!editName.trim()} className="bg-slate-800 hover:bg-slate-900">{zh ? '保存' : 'Save'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
