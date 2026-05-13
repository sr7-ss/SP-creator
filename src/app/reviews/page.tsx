'use client';

import { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/lib/store';
import ReviewMiningPanel from '@/components/reviews/ReviewMiningPanel';

interface ProjectOption {
  id: string;
  name: string;
}

export default function ReviewsPage() {
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Fetch user's projects for the optional project selector
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setProjects(
            data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
          );
        }
      } catch { /* ignore */ }
    }
    fetchProjects();
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1e2a3a]/8 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-[#1e2a3a]" />
          </div>
          <div>
            <h1 className="font-syne text-2xl font-bold text-[#1e2a3a]">{t('reviews.title')}</h1>
            <p className="text-[11px] text-slate-400">{t('reviews.uploadDesc')}</p>
          </div>
        </div>

        {/* Optional project selector */}
        {projects.length > 0 && (
          <Select value={selectedProjectId} onValueChange={(val) => val && setSelectedProjectId(val)}>
            <SelectTrigger className="w-[200px] bg-white text-sm">
              <SelectValue placeholder={zh ? '关联项目（可选）' : 'Link to project (optional)'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{zh ? '不关联' : 'None'}</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Main content */}
      <ReviewMiningPanel
        projectId={selectedProjectId && selectedProjectId !== 'none' ? selectedProjectId : undefined}
      />
    </div>
  );
}
