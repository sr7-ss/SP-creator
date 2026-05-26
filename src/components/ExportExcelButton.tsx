'use client';

import { useState, useCallback } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/store';
import { PARAM_CATEGORIES } from '@/lib/constants/param-weights';
import { SpItem } from '@/types';

interface ExportExcelButtonProps {
  projectName: string;
  activeTab: 'compare' | 'ksp' | 'packaging';
  spItems: SpItem[];
  products: { id: string; name: string; isOwnProduct: boolean; values: Record<string, string> }[];
}

export default function ExportExcelButton({ projectName, activeTab, spItems, products }: ExportExcelButtonProps) {
  const { locale } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);

    try {
      // Dynamic import to keep bundle small
      const XLSX = await import('xlsx');

      const wb = XLSX.utils.book_new();

      if (activeTab === 'compare') {
        // Param comparison table
        const headers = [locale === 'zh' ? '分类' : 'Category', locale === 'zh' ? '参数' : 'Parameter', ...products.map(p => p.name || (p.isOwnProduct ? '自家产品' : '竞品'))];
        const rows: string[][] = [headers];

        for (const cat of PARAM_CATEGORIES) {
          for (const field of cat.fields) {
            const row = [
              locale === 'zh' ? cat.nameZh : cat.nameEn,
              locale === 'zh' ? field.nameZh : field.nameEn,
              ...products.map(p => p.values[field.key] || ''),
            ];
            rows.push(row);
          }
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        // Set column widths
        ws['!cols'] = [{ wch: 12 }, { wch: 16 }, ...products.map(() => ({ wch: 30 }))];
        XLSX.utils.book_append_sheet(wb, ws, locale === 'zh' ? '参数对比' : 'Comparison');

      } else if (activeTab === 'ksp') {
        // SP tiering
        const headers = ['Tier', locale === 'zh' ? '卖点' : 'Feature', locale === 'zh' ? '参数值' : 'Param Value'];
        const rows: string[][] = [headers];

        for (const item of [...spItems].sort((a, b) => a.tier - b.tier)) {
          rows.push([`T${item.tier}`, item.featureName, item.paramValue]);
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 6 }, { wch: 25 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, ws, 'SP');

      } else {
        // Packaging
        const headers = ['Tier', locale === 'zh' ? '卖点' : 'Feature', 'L1', 'L2 Slogan', locale === 'zh' ? 'Slogan类型' : 'Type', locale === 'zh' ? '备选Slogan' : 'Alt Slogans', 'L3'];
        const rows: string[][] = [headers];

        for (const item of [...spItems].sort((a, b) => a.tier - b.tier)) {
          if (!item.l1Name) continue;
          const l3Text = item.l3Details?.map(d => `${d.name}: ${d.description}`).join(' | ') || '';
          const altsText = item.l2Alternatives?.map(a => a.text).join(' | ') || '';
          rows.push([`T${item.tier}`, item.featureName, item.l1Name || '', item.l2Slogan || '', item.l2SloganType || '', altsText, l3Text]);
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 25 }, { wch: 35 }, { wch: 12 }, { wch: 40 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(wb, ws, locale === 'zh' ? '卖点包装' : 'Packaging');
      }

      const tabName = activeTab === 'compare' ? '参数对比' : activeTab === 'ksp' ? '卖点分级' : '卖点包装';
      XLSX.writeFile(wb, `${projectName}-${tabName}.xlsx`);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [exporting, activeTab, projectName, spItems, products, locale]);

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
    >
      {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
      {locale === 'zh' ? '导出表格' : 'Export Excel'}
    </button>
  );
}
