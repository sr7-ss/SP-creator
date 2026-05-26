'use client';

import { useState, useCallback } from 'react';
import { Presentation, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/store';
import { PARAM_CATEGORIES } from '@/lib/constants/param-weights';
import { SpItem, CompetitiveAnalysis } from '@/types';

interface ExportPptButtonProps {
  projectName: string;
  segment?: string;
  spItems: SpItem[];
  analysis: CompetitiveAnalysis | null;
  products: { id: string; name: string; isOwnProduct: boolean; values: Record<string, string> }[];
}

// Color palette
const COLORS = {
  dark: '1e2a3a',
  white: 'FFFFFF',
  lightGray: 'F8F8F8',
  medGray: 'E2E8F0',
  slateText: '475569',
  slateDark: '1E293B',
  red: 'EF4444',
  redLight: 'FEF2F2',
  amber: 'F59E0B',
  amberLight: 'FFFBEB',
  green: '22C55E',
  greenLight: 'F0FDF4',
  blue: '3B82F6',
  blueLight: 'EFF6FF',
};

export default function ExportPptButton({ projectName, segment, spItems, analysis, products }: ExportPptButtonProps) {
  const { locale } = useTranslation();
  const zh = locale === 'zh';
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);

    try {
      const pptxgen = (await import('pptxgenjs')).default;
      const pres = new pptxgen();

      pres.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
      pres.layout = 'WIDE';

      // ─── Slide 1: Title ───
      const titleSlide = pres.addSlide();
      titleSlide.background = { color: COLORS.dark };
      titleSlide.addText(projectName, {
        x: 0.8, y: 2.0, w: 11.7, h: 1.2,
        fontSize: 42, fontFace: 'Arial', color: COLORS.white, bold: true,
      });
      titleSlide.addText(
        segment
          ? `${zh ? 'SP 卖点分析报告' : 'SP Selling Point Analysis'} — ${segment}`
          : (zh ? 'SP 卖点分析报告' : 'SP Selling Point Analysis'),
        {
          x: 0.8, y: 3.2, w: 11.7, h: 0.6,
          fontSize: 18, fontFace: 'Arial', color: '94A3B8',
        }
      );
      titleSlide.addText(`SP Creator | ${new Date().toLocaleDateString()}`, {
        x: 0.8, y: 6.5, w: 11.7, h: 0.4,
        fontSize: 11, fontFace: 'Arial', color: '64748B',
      });

      // ─── Slide 2: Parameter Comparison Table ───
      if (products.length > 0) {
        const compareSlide = pres.addSlide();
        compareSlide.addText(zh ? '参数对比' : 'Parameter Comparison', {
          x: 0.5, y: 0.3, w: 12, h: 0.6,
          fontSize: 24, fontFace: 'Arial', color: COLORS.slateDark, bold: true,
        });

        // Build table data
        const ownProduct = products.find(p => p.isOwnProduct);
        const competitors = products.filter(p => !p.isOwnProduct);
        const allProds = ownProduct ? [ownProduct, ...competitors] : competitors;

        const headerRow = [
          { text: zh ? '参数' : 'Parameter', options: { bold: true, fill: { color: COLORS.dark }, color: COLORS.white, fontSize: 9 } },
          ...allProds.map(p => ({
            text: p.name || (p.isOwnProduct ? (zh ? '自家' : 'Own') : ''),
            options: {
              bold: true,
              fill: { color: p.isOwnProduct ? COLORS.dark : '334155' },
              color: COLORS.white,
              fontSize: 9,
            },
          })),
        ];

        // Collect populated params
        const paramRows: Array<{ key: string; label: string }> = [];
        for (const cat of PARAM_CATEGORIES) {
          for (const field of cat.fields) {
            const hasValue = allProds.some(p => p.values[field.key]);
            if (hasValue) {
              paramRows.push({ key: field.key, label: zh ? field.nameZh : field.nameEn });
            }
          }
        }

        // Limit to ~25 rows to fit on a slide
        const visibleParams = paramRows.slice(0, 25);
        const dataRows = visibleParams.map((param, idx) => [
          { text: param.label, options: { fontSize: 8, fill: { color: idx % 2 === 0 ? COLORS.lightGray : COLORS.white } } },
          ...allProds.map(p => ({
            text: p.values[param.key] || '-',
            options: { fontSize: 8, fill: { color: idx % 2 === 0 ? COLORS.lightGray : COLORS.white } },
          })),
        ]);

        const colW = Math.min(2.5, (12.3 - 2.5) / Math.max(allProds.length, 1));
        compareSlide.addTable([headerRow, ...dataRows], {
          x: 0.5, y: 1.1, w: 12.3,
          colW: [2.5, ...allProds.map(() => colW)],
          border: { type: 'solid', pt: 0.5, color: COLORS.medGray },
          rowH: 0.28,
          autoPage: true,
          autoPageRepeatHeader: true,
        });

        if (paramRows.length > 25) {
          compareSlide.addText(`+ ${paramRows.length - 25} ${zh ? '个参数未显示' : 'more parameters'}`, {
            x: 0.5, y: 7.0, w: 12, h: 0.3, fontSize: 9, color: '94A3B8', fontFace: 'Arial',
          });
        }
      }

      // ─── Slide 3: Competitive Analysis Summary ───
      if (analysis) {
        const analysisSlide = pres.addSlide();
        analysisSlide.addText(zh ? '竞品分析摘要' : 'Competitive Analysis Summary', {
          x: 0.5, y: 0.3, w: 12, h: 0.6,
          fontSize: 24, fontFace: 'Arial', color: COLORS.slateDark, bold: true,
        });

        // 3 columns: advantages, neutral, disadvantages
        const columns = [
          { title: zh ? '优势' : 'Advantages', items: analysis.advantages, color: COLORS.green, bgColor: COLORS.greenLight },
          { title: zh ? '持平' : 'Neutral', items: analysis.neutral, color: COLORS.blue, bgColor: COLORS.blueLight },
          { title: zh ? '劣势' : 'Disadvantages', items: analysis.disadvantages, color: COLORS.red, bgColor: COLORS.redLight },
        ];

        columns.forEach((col, colIdx) => {
          const x = 0.5 + colIdx * 4.1;
          analysisSlide.addText(`${col.title} (${col.items.length})`, {
            x, y: 1.2, w: 3.8, h: 0.4,
            fontSize: 14, fontFace: 'Arial', color: col.color, bold: true,
          });

          col.items.slice(0, 8).forEach((item, idx) => {
            const y = 1.7 + idx * 0.65;
            analysisSlide.addShape(pres.ShapeType.roundRect, {
              x, y, w: 3.8, h: 0.55,
              fill: { color: col.bgColor },
              rectRadius: 0.05,
            });
            analysisSlide.addText(item.feature, {
              x: x + 0.15, y, w: 3.5, h: 0.28,
              fontSize: 10, fontFace: 'Arial', color: COLORS.slateDark, bold: true,
            });
            analysisSlide.addText(item.assessment, {
              x: x + 0.15, y: y + 0.25, w: 3.5, h: 0.25,
              fontSize: 8, fontFace: 'Arial', color: COLORS.slateText,
            });
          });
        });
      }

      // ─── Slide 4: SP Tier Overview ───
      if (spItems.length > 0) {
        const spSlide = pres.addSlide();
        spSlide.addText(zh ? '卖点分级' : 'SP Tier Classification', {
          x: 0.5, y: 0.3, w: 12, h: 0.6,
          fontSize: 24, fontFace: 'Arial', color: COLORS.slateDark, bold: true,
        });

        const tierConfigs = [
          { tier: 1, label: zh ? 'T1 核心卖点' : 'T1 Core', color: COLORS.red, bg: COLORS.redLight },
          { tier: 2, label: zh ? 'T2 重要卖点' : 'T2 Important', color: COLORS.amber, bg: COLORS.amberLight },
          { tier: 3, label: zh ? 'T3 基础卖点' : 'T3 Basic', color: '64748B', bg: COLORS.lightGray },
        ];

        tierConfigs.forEach((tc, colIdx) => {
          const tierItems = spItems.filter(i => i.tier === tc.tier);
          const x = 0.5 + colIdx * 4.1;

          spSlide.addShape(pres.ShapeType.roundRect, {
            x, y: 1.1, w: 3.8, h: 0.45,
            fill: { color: tc.bg },
            rectRadius: 0.05,
          });
          spSlide.addText(`${tc.label} (${tierItems.length})`, {
            x: x + 0.15, y: 1.15, w: 3.5, h: 0.35,
            fontSize: 13, fontFace: 'Arial', color: tc.color, bold: true,
          });

          tierItems.slice(0, 8).forEach((item, idx) => {
            const y = 1.7 + idx * 0.55;
            spSlide.addShape(pres.ShapeType.roundRect, {
              x, y, w: 3.8, h: 0.45,
              fill: { color: COLORS.white },
              shadow: { type: 'outer', blur: 3, offset: 1, color: '00000010' },
              rectRadius: 0.05,
              line: { color: COLORS.medGray, width: 0.5 },
            });
            spSlide.addText(item.featureName, {
              x: x + 0.15, y: y + 0.02, w: 2.5, h: 0.2,
              fontSize: 10, fontFace: 'Arial', color: COLORS.slateDark, bold: true,
            });
            spSlide.addText(item.paramValue, {
              x: x + 0.15, y: y + 0.22, w: 3.5, h: 0.18,
              fontSize: 8, fontFace: 'Arial', color: COLORS.slateText,
            });
          });
        });
      }

      // ─── Slides 5+: Packaging per tier ───
      const packaged = spItems.filter(i => i.l1Name);
      if (packaged.length > 0) {
        for (const tc of [
          { tier: 1, label: zh ? 'T1 核心卖点包装' : 'T1 Core Packaging', color: COLORS.red, bg: COLORS.redLight },
          { tier: 2, label: zh ? 'T2 重要卖点包装' : 'T2 Important Packaging', color: COLORS.amber, bg: COLORS.amberLight },
          { tier: 3, label: zh ? 'T3 基础卖点包装' : 'T3 Basic Packaging', color: '64748B', bg: COLORS.lightGray },
        ]) {
          const tierItems = packaged.filter(i => i.tier === tc.tier);
          if (tierItems.length === 0) continue;

          const slide = pres.addSlide();
          slide.addText(tc.label, {
            x: 0.5, y: 0.3, w: 12, h: 0.6,
            fontSize: 24, fontFace: 'Arial', color: COLORS.slateDark, bold: true,
          });

          tierItems.forEach((item, idx) => {
            // Layout: 2 items per row
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const x = 0.5 + col * 6.2;
            const y = 1.1 + row * 2.8;

            if (y > 6.5) return; // Skip if off-slide

            // Card background
            slide.addShape(pres.ShapeType.roundRect, {
              x, y, w: 5.9, h: 2.6,
              fill: { color: COLORS.white },
              line: { color: COLORS.medGray, width: 0.75 },
              rectRadius: 0.1,
            });

            // Left accent bar
            slide.addShape(pres.ShapeType.rect, {
              x, y: y + 0.1, w: 0.06, h: 2.4,
              fill: { color: tc.color },
            });

            // L1 Name
            slide.addText(item.l1Name || '', {
              x: x + 0.25, y: y + 0.15, w: 5.4, h: 0.35,
              fontSize: 13, fontFace: 'Arial', color: COLORS.slateDark, bold: true,
            });

            // L2 Slogan
            slide.addText(`"${item.l2Slogan || ''}"`, {
              x: x + 0.25, y: y + 0.5, w: 5.4, h: 0.3,
              fontSize: 10, fontFace: 'Arial', color: COLORS.slateText, italic: true,
            });

            // L2 Type badge
            if (item.l2SloganType) {
              const typeLabel = zh
                ? { factual: '写实型', functional: '功能价值型', emotional: '情绪价值型' }[item.l2SloganType]
                : item.l2SloganType;
              slide.addText(typeLabel || '', {
                x: x + 0.25, y: y + 0.8, w: 1.2, h: 0.22,
                fontSize: 7, fontFace: 'Arial', color: tc.color,
                shape: pres.ShapeType.roundRect,
                fill: { color: tc.bg },
                rectRadius: 0.03,
                align: 'center',
              });
            }

            // L3 Details
            if (item.l3Details && item.l3Details.length > 0) {
              item.l3Details.slice(0, 4).forEach((sub, subIdx) => {
                const subY = y + 1.1 + subIdx * 0.35;
                const techniqueTag = zh
                  ? { concrete: '具象化', equivalent: '等价换算', extreme: '极限表达' }[sub.technique]
                  : sub.technique;
                slide.addText(`${sub.name}: ${sub.description}`, {
                  x: x + 0.35, y: subY, w: 4.5, h: 0.3,
                  fontSize: 8, fontFace: 'Arial', color: COLORS.slateText,
                  bullet: { type: 'bullet', indent: 10 },
                });
                slide.addText(techniqueTag || '', {
                  x: x + 4.9, y: subY, w: 0.8, h: 0.22,
                  fontSize: 6, fontFace: 'Arial', color: '94A3B8', align: 'right',
                });
              });
            }
          });

          // If more than 4 items, add overflow slide
          if (tierItems.length > 4) {
            const overflowSlide = pres.addSlide();
            overflowSlide.addText(`${tc.label} (${zh ? '续' : 'cont.'})`, {
              x: 0.5, y: 0.3, w: 12, h: 0.6,
              fontSize: 24, fontFace: 'Arial', color: COLORS.slateDark, bold: true,
            });

            tierItems.slice(4).forEach((item, idx) => {
              const col = idx % 2;
              const row = Math.floor(idx / 2);
              const x = 0.5 + col * 6.2;
              const y = 1.1 + row * 2.8;
              if (y > 6.5) return;

              overflowSlide.addShape(pres.ShapeType.roundRect, {
                x, y, w: 5.9, h: 2.6,
                fill: { color: COLORS.white },
                line: { color: COLORS.medGray, width: 0.75 },
                rectRadius: 0.1,
              });
              overflowSlide.addShape(pres.ShapeType.rect, {
                x, y: y + 0.1, w: 0.06, h: 2.4,
                fill: { color: tc.color },
              });
              overflowSlide.addText(item.l1Name || '', {
                x: x + 0.25, y: y + 0.15, w: 5.4, h: 0.35,
                fontSize: 13, fontFace: 'Arial', color: COLORS.slateDark, bold: true,
              });
              overflowSlide.addText(`"${item.l2Slogan || ''}"`, {
                x: x + 0.25, y: y + 0.5, w: 5.4, h: 0.3,
                fontSize: 10, fontFace: 'Arial', color: COLORS.slateText, italic: true,
              });
              if (item.l3Details) {
                item.l3Details.slice(0, 4).forEach((sub, subIdx) => {
                  overflowSlide.addText(`${sub.name}: ${sub.description}`, {
                    x: x + 0.35, y: y + 1.0 + subIdx * 0.35, w: 5.2, h: 0.3,
                    fontSize: 8, fontFace: 'Arial', color: COLORS.slateText,
                    bullet: { type: 'bullet', indent: 10 },
                  });
                });
              }
            });
          }
        }
      }

      await pres.writeFile({ fileName: `${projectName}-SP.pptx` });
    } catch (err) {
      console.error('PPT export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [exporting, projectName, segment, spItems, analysis, products, zh, locale]);

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
    >
      {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Presentation className="h-3.5 w-3.5" />}
      {zh ? '导出 PPT' : 'Export PPT'}
    </button>
  );
}
