'use client';

import { useState, useCallback } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/store';

interface ExportImageButtonProps {
  targetRef: React.RefObject<HTMLDivElement | null>;
  filename?: string;
}

export default function ExportImageButton({ targetRef, filename = 'export.png' }: ExportImageButtonProps) {
  const { locale } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!targetRef.current || exporting) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [targetRef, filename, exporting]);

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
    >
      {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
      {locale === 'zh' ? '导出图片' : 'Export Image'}
    </button>
  );
}
