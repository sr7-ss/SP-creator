'use client';

import { useState, useCallback } from 'react';
import { Save, History, ChevronDown, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KspItem } from '@/types';

interface KspVersionMeta {
  id: string;
  name: string;
  createdAt: string;
}

interface KspVersionButtonsProps {
  projectId: string;
  items: KspItem[];
  onLoadVersion: (items: KspItem[]) => void;
  locale: string;
}

export default function KspVersionButtons({ projectId, items, onLoadVersion, locale }: KspVersionButtonsProps) {
  const zh = locale === 'zh';

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);
  const [versions, setVersions] = useState<KspVersionMeta[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const fetchVersions = useCallback(async () => {
    setLoadingVersions(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ksp-versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch { /* ignore */ }
    finally { setLoadingVersions(false); }
  }, [projectId]);

  const handleSaveVersion = useCallback(async () => {
    if (!versionName.trim()) return;
    setSavingVersion(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ksp-versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: versionName.trim(), kspItems: items }),
      });
      if (res.ok) {
        setShowSaveDialog(false);
        setVersionName('');
        fetchVersions();
      }
    } catch { /* ignore */ }
    finally { setSavingVersion(false); }
  }, [projectId, versionName, items, fetchVersions]);

  const handleLoadVersion = useCallback(async (versionId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/ksp-versions/${versionId}`);
      if (res.ok) {
        const data = await res.json();
        const snapshot = data.version?.snapshot as KspItem[] | undefined;
        if (snapshot && Array.isArray(snapshot)) {
          onLoadVersion(snapshot);
          setShowVersions(false);
        }
      }
    } catch { /* ignore */ }
  }, [projectId, onLoadVersion]);

  const handleDeleteVersion = useCallback(async (versionId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/ksp-versions/${versionId}`, { method: 'DELETE' });
      fetchVersions();
    } catch { /* ignore */ }
  }, [projectId, fetchVersions]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowSaveDialog(true)}
        className="gap-1.5 text-xs"
      >
        <Save className="h-3.5 w-3.5" />
        {zh ? '保存方案' : 'Save Version'}
      </Button>
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setShowVersions(!showVersions); if (!showVersions) fetchVersions(); }}
          className="gap-1.5 text-xs"
        >
          <History className="h-3.5 w-3.5" />
          {zh ? '历史方案' : 'History'}
          <ChevronDown className="h-3 w-3" />
        </Button>
        {showVersions && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowVersions(false)} />
            <div className="absolute top-full right-0 mt-1 z-20 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[240px] max-h-[300px] overflow-y-auto">
              {loadingVersions ? (
                <div className="px-3 py-4 text-center">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto text-slate-400" />
                </div>
              ) : versions.length === 0 ? (
                <p className="px-3 py-3 text-xs text-slate-400 text-center">
                  {zh ? '暂无保存的方案' : 'No saved versions'}
                </p>
              ) : (
                versions.map(v => (
                  <div key={v.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
                    <button
                      onClick={() => handleLoadVersion(v.id)}
                      className="flex-1 text-left"
                    >
                      <p className="text-xs font-medium text-slate-700">{v.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(v.createdAt).toLocaleDateString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </button>
                    <button
                      onClick={() => handleDeleteVersion(v.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Save version dialog - rendered as floating panel */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setShowSaveDialog(false)}>
          <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-slate-200 shadow-lg min-w-[320px]" onClick={e => e.stopPropagation()}>
            <Input
              value={versionName}
              onChange={e => setVersionName(e.target.value)}
              placeholder={zh ? '方案名称，如「主打续航」' : 'Version name, e.g. "Battery focus"'}
              className="h-8 text-xs flex-1"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveVersion(); } }}
            />
            <Button
              size="sm"
              onClick={handleSaveVersion}
              disabled={!versionName.trim() || savingVersion}
              className="h-8 text-xs bg-slate-800"
            >
              {savingVersion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </Button>
            <button onClick={() => setShowSaveDialog(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
