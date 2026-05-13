'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Download, Camera, FileSpreadsheet, Presentation, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/store';
import { PARAM_CATEGORIES } from '@/lib/constants/param-weights';
import { KspItem, CompetitiveAnalysis } from '@/types';
import { track } from '@/lib/analytics/track';

interface ExportDropdownProps {
  targetRef: React.RefObject<HTMLDivElement | null>;
  filename?: string;
  projectName: string;
  activeTab: 'compare' | 'ksp' | 'packaging';
  kspItems: KspItem[];
  analysis: CompetitiveAnalysis | null;
  segment?: string;
  products: { id: string; name: string; isOwnProduct: boolean; values: Record<string, string> }[];
}

export default function ExportDropdown({
  targetRef,
  filename = 'export.png',
  projectName,
  activeTab,
  kspItems,
  analysis,
  segment,
  products,
}: ExportDropdownProps) {
  const { locale } = useTranslation();
  const zh = locale === 'zh';
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleExportImage = useCallback(async () => {
    if (!targetRef.current || exporting) return;
    setExporting('image');
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
      console.error('Export image failed:', err);
    } finally {
      setExporting(null);
      setOpen(false);
    }
  }, [targetRef, filename, exporting]);

  const handleExportExcel = useCallback(async () => {
    if (exporting) return;
    setExporting('excel');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      if (activeTab === 'compare') {
        const allFields = PARAM_CATEGORIES.flatMap(c => c.fields);
        const headers = [zh ? '参数' : 'Parameter', ...products.map(p => p.name)];
        const rows = allFields.map(field => {
          const row = [zh ? field.nameZh : field.nameEn];
          for (const p of products) {
            row.push(p.values[field.key] || '');
          }
          return row;
        }).filter(row => row.some((v, i) => i > 0 && v));
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, zh ? '参数对比' : 'Compare');
      } else if (activeTab === 'ksp') {
        const headers = [zh ? '层级' : 'Tier', zh ? '卖点' : 'Feature', zh ? '参数值' : 'Value'];
        const rows = kspItems
          .filter(i => i.tier >= 1)
          .sort((a, b) => a.tier - b.tier)
          .map(i => [`T${i.tier}`, i.featureName, i.paramValue || '']);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, 'KSP');
      }

      XLSX.writeFile(wb, `${projectName}-${activeTab}.xlsx`);
      track('export_completed', { format: 'xlsx', tab: activeTab });
    } catch (err) {
      console.error('Export excel failed:', err);
    } finally {
      setExporting(null);
      setOpen(false);
    }
  }, [activeTab, kspItems, products, projectName, exporting, zh]);

  const handleExportPpt = useCallback(async () => {
    if (exporting) return;
    setExporting('ppt');
    try {
      // Dynamic import
      const pptxgen = (await import('pptxgenjs')).default;
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9';

      // Title slide
      const titleSlide = pres.addSlide();
      titleSlide.addText(projectName, { x: 0.5, y: 1.5, w: 9, fontSize: 36, bold: true, color: '1e2a3a' });
      if (segment) {
        titleSlide.addText(segment, { x: 0.5, y: 2.5, w: 9, fontSize: 18, color: '475569' });
      }

      // KSP slide
      if (kspItems.filter(i => i.tier >= 1).length > 0) {
        const kspSlide = pres.addSlide();
        kspSlide.addText(zh ? '卖点分级' : 'KSP Tier', { x: 0.5, y: 0.3, w: 9, fontSize: 24, bold: true, color: '1e2a3a' });
        let yPos = 1.0;
        for (const tier of [1, 2, 3]) {
          const tierItems = kspItems.filter(i => i.tier === tier);
          if (tierItems.length === 0) continue;
          kspSlide.addText(`T${tier}`, { x: 0.5, y: yPos, w: 1, fontSize: 16, bold: true, color: tier === 1 ? 'EF4444' : tier === 2 ? 'F59E0B' : '22C55E' });
          const itemTexts = tierItems.map(i => `• ${i.featureName}${i.paramValue ? `: ${i.paramValue}` : ''}`).join('\n');
          kspSlide.addText(itemTexts, { x: 1.5, y: yPos, w: 8, fontSize: 14, color: '475569', lineSpacing: 22 });
          yPos += tierItems.length * 0.4 + 0.5;
        }
      }

      await pres.writeFile({ fileName: `${projectName}-KSP.pptx` });
      track('export_completed', { format: 'pptx', tab: activeTab });
    } catch (err) {
      console.error('Export PPT failed:', err);
    } finally {
      setExporting(null);
      setOpen(false);
    }
  }, [kspItems, projectName, segment, exporting, zh]);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className="gap-1.5 text-xs"
      >
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {zh ? '导出' : 'Export'}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 z-20 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[160px]">
            <button
              onClick={handleExportImage}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Camera className="h-3.5 w-3.5 text-slate-400" />
              {zh ? '导出图片' : 'Export Image'}
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" />
              {zh ? '导出表格' : 'Export Excel'}
            </button>
            <button
              onClick={handleExportPpt}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Presentation className="h-3.5 w-3.5 text-slate-400" />
              {zh ? '导出PPT' : 'Export PPT'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
