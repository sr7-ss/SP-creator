'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { FolderOpen, ArrowRight, Trash2, Package, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/store';
import { cachedFetch, invalidateCache } from '@/lib/utils/fetch-cache';

interface ProjectSummary {
  id: string;
  name: string;
  segment?: string;
  market?: string;
  launched: boolean;
  createdAt: string;
  _count: { products: number };
}

// Group projects by price segment (5000 per tier)
function getSegmentGroup(segment?: string): string {
  if (!segment) return 'other';
  const num = parseInt(segment.replace(/[^0-9]/g, ''), 10);
  if (isNaN(num)) return 'other';
  const tier = Math.floor(num / 5000) * 5000;
  return String(tier);
}

function getSegmentLabel(group: string, locale: string): string {
  if (group === 'other') return locale === 'zh' ? '未分类' : 'Uncategorized';
  const num = parseInt(group, 10);
  return String(num);
}

export default function ProjectsPage() {
  const { t, locale } = useTranslation();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideLaunched, setHideLaunched] = useState(false);

  const fetchProjects = () => {
    setLoading(true);
    cachedFetch<ProjectSummary[]>('/api/projects')
      .then((data) => {
        setProjects(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(locale === 'zh' ? '确定删除此项目？' : 'Are you sure you want to delete this project?')) return;

    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      invalidateCache('/api/projects');
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  const toggleLaunched = async (e: React.MouseEvent, id: string, currentState: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ launched: !currentState }),
      });
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, launched: !currentState } : p))
      );
    } catch (err) {
      console.error('Failed to toggle launched:', err);
    }
  };

  // Filter and group
  const filteredProjects = useMemo(() => {
    return hideLaunched ? projects.filter((p) => !p.launched) : projects;
  }, [projects, hideLaunched]);

  const groupedProjects = useMemo(() => {
    const groups = new Map<string, ProjectSummary[]>();

    filteredProjects.forEach((p) => {
      const group = getSegmentGroup(p.segment);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(p);
    });

    const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'other') return 1;
      if (b === 'other') return -1;
      const aNum = parseInt(a, 10);
      const bNum = parseInt(b, 10);
      return bNum - aNum;
    });

    return sorted;
  }, [filteredProjects]);

  const launchedCount = projects.filter((p) => p.launched).length;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-slate-400">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          {t('nav.projects')}
        </h1>
        {launchedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHideLaunched(!hideLaunched)}
            className={`gap-2 text-xs ${hideLaunched ? 'bg-slate-100' : ''}`}
          >
            {hideLaunched ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            {hideLaunched
              ? (locale === 'zh' ? '显示已上市' : 'Show launched')
              : (locale === 'zh' ? '隐藏已上市' : 'Hide launched')
            }
            <span className="text-slate-400">({launchedCount})</span>
          </Button>
        )}
      </div>

      {/* Empty state */}
      {filteredProjects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-slate-400">
            <FolderOpen className="h-12 w-12 mb-4" />
            <p className="text-sm">
              {hideLaunched
                ? (locale === 'zh' ? '所有项目都已上市' : 'All projects are launched')
                : t('project.noProjects')
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        groupedProjects.map(([group, items]) => (
          <div key={group}>
            {/* Segment group header */}
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                {locale === 'zh' ? '价位段' : 'Segment'}{' '}
                {getSegmentLabel(group, locale)}
              </h2>
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400">
                {items.length} {locale === 'zh' ? '个项目' : items.length === 1 ? 'project' : 'projects'}
              </span>
            </div>

            {/* Project cards */}
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <Card className={`group cursor-pointer transition-all hover:shadow-md relative ${
                    project.launched
                      ? 'bg-slate-50 border-slate-200 opacity-60 hover:opacity-80'
                      : 'bg-white hover:border-slate-300'
                  }`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className={`truncate ${project.launched ? 'text-slate-400' : ''}`}>
                          {project.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => toggleLaunched(e, project.id, project.launched)}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-green-500 transition-all p-1"
                            title={project.launched
                              ? (locale === 'zh' ? '标记为未上市' : 'Mark as not launched')
                              : (locale === 'zh' ? '标记为已上市' : 'Mark as launched')
                            }
                          >
                            <CheckCircle2 className={`h-3.5 w-3.5 ${project.launched ? 'text-green-500 opacity-100' : ''}`} />
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, project.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <ArrowRight className={`h-4 w-4 transition-colors ${
                            project.launched
                              ? 'text-slate-300'
                              : 'text-slate-300 group-hover:text-slate-700'
                          }`} />
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 flex-wrap">
                        {project.market && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            {project.market}
                          </Badge>
                        )}
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Package className="h-3 w-3" />
                          {project._count.products}
                        </span>
                      </div>
                    </CardContent>
                    {/* Launched badge - bottom right */}
                    {project.launched && (
                      <div className="absolute bottom-3 right-4 flex items-center gap-1 text-green-500">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-xs font-medium">
                          {locale === 'zh' ? '已上市' : 'Launched'}
                        </span>
                      </div>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
