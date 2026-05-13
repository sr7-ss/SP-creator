'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Trash2, Star, X, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/lib/store';
import { PARAM_CATEGORIES, type ParamCategory, type ParamField } from '@/lib/constants/param-weights';
import SmartPaste from './SmartPaste';

/** Generate a fallback spec-lookup URL for any product (even without saved sourceUrl) */
function getSpecLookupUrl(productName: string): string {
  return `https://www.gsmarena.com/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(productName)}`;
}

interface ParamRow {
  key: string;
  nameEn: string;
  nameZh: string;
}

interface ProductColumn {
  id: string;
  name: string;
  isOwnProduct: boolean;
  values: Record<string, string>;
  sourceUrl?: string;
}

interface ParamTableProps {
  projectId: string;
  initialProducts?: ProductColumn[];
  onSave?: (products: ProductColumn[]) => void;
  smartPasteFooterLeft?: React.ReactNode;
  /** Optional component rendered between SmartPaste and Manual Input */
  extraToolbarButtons?: React.ReactNode;
  rightToolbarButtons?: React.ReactNode;
}

export default function ParamTable({ projectId, initialProducts, onSave, smartPasteFooterLeft, extraToolbarButtons, rightToolbarButtons }: ParamTableProps) {
  const { t, locale } = useTranslation();
  const [customRows, setCustomRows] = useState<ParamRow[]>([]);
  const [products, setProducts] = useState<ProductColumn[]>(
    initialProducts || [
      { id: 'own-1', name: '', isOwnProduct: true, values: {} },
    ]
  );
  // Sync when parent adds/removes products (e.g. competitor search).
  // Only trigger on product count or ID changes, NOT value edits.
  const initialProductIds = initialProducts?.map(p => p.id).join(',') ?? '';
  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      setProducts(initialProducts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductIds]);

  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set());

  // Show edit tip for first 3 visits
  const [showEditTip, setShowEditTip] = useState(false);
  useEffect(() => {
    const key = 'ksp-param-table-edit-tip-count';
    const count = parseInt(localStorage.getItem(key) || '0', 10);
    if (count < 3) {
      setShowEditTip(true);
      localStorage.setItem(key, String(count + 1));
    }
  }, []);

  const toggleCategory = useCallback((catKey: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catKey)) next.delete(catKey);
      else next.add(catKey);
      return next;
    });
  }, []);

  // Get all rows (categories flattened + custom rows)
  const allRows: ParamRow[] = [
    ...PARAM_CATEGORIES.flatMap(cat => cat.fields),
    ...customRows,
  ];

  const addRow = useCallback(() => {
    const key = `custom_${Date.now()}`;
    setCustomRows(prev => [...prev, { key, nameEn: '', nameZh: '' }]);
  }, []);

  const removeRow = useCallback((key: string) => {
    setCustomRows(prev => prev.filter(r => r.key !== key));
  }, []);

  const addProduct = useCallback((isOwn: boolean) => {
    setProducts(prev => [
      ...prev,
      { id: `${isOwn ? 'own' : 'comp'}-${Date.now()}`, name: '', isOwnProduct: isOwn, values: {} },
    ]);
  }, []);

  const removeProduct = useCallback((id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    fetch(`/api/projects/${projectId}/products?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
      err => console.error('Failed to delete product:', err)
    );
  }, [projectId]);

  const updateProductName = useCallback((id: string, name: string) => {
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, name } : p)));
  }, []);

  const updateValue = useCallback((productId: string, rowKey: string, value: string) => {
    setProducts(prev =>
      prev.map(p => p.id === productId ? { ...p, values: { ...p.values, [rowKey]: value } } : p)
    );
  }, []);

  const updateRowName = useCallback((key: string, field: 'nameEn' | 'nameZh', value: string) => {
    setCustomRows(prev => prev.map(r => (r.key === key ? { ...r, [field]: value } : r)));
  }, []);

  // ─── Highlight Logic ───────────────────────────────────────────

  const extractMetrics = (val: string): { num: number; unit: string }[] => {
    const metrics: { num: number; unit: string }[] = [];
    const regex = /([\d.]+)\s*(mAh|mah|Hz|hz|nits|W|w|GB|gb|MP|mp|万|英寸|寸|mm²|mm2|分|nm|g|ppi)/gi;
    let match;
    while ((match = regex.exec(val)) !== null) {
      metrics.push({ num: parseFloat(match[1]), unit: match[2].toLowerCase() });
    }
    if (metrics.length === 0) {
      const plain = val.match(/([\d.]+)/);
      if (plain) metrics.push({ num: parseFloat(plain[1]), unit: '_plain' });
    }
    return metrics;
  };

  const SKIP_HIGHLIGHT_KEYS = new Set([
    'launch', 'others',
    'display.protection',
    'platform.cpu', 'platform.gpu',
    'camera.video', 'selfie.video',
    'body.build', 'body.sim', 'body.colors',
    'misc.others', 'misc.nfc',
    'software.os', 'software.updatePolicy',
  ]);

  const isPriceKey = (key: string) => key === 'misc.price' || key === 'price';
  const isLowerBetter = (key: string) =>
    isPriceKey(key) || key === 'body.weight';

  const splitSegments = (val: string): { text: string; start: number; end: number; num: number }[] => {
    const segments: { text: string; start: number; end: number; num: number }[] = [];
    // Split by common separators: + / , ，and also " / " (spaced slash)
    const parts = val.split(/([+,，]|\s*\/\s*)/);
    let cursor = 0;
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed && !/^[+/,，]$/.test(trimmed)) {
        const numMatch = trimmed.match(/([\d.]+)/);
        if (numMatch) {
          const idx = val.indexOf(trimmed, cursor);
          segments.push({
            text: trimmed,
            start: idx,
            end: idx + trimmed.length,
            num: parseFloat(numMatch[1]),
          });
        }
      }
      cursor += part.length;
    }

    // If no segments from splitting (no separators), try extracting
    // all "number+unit" tokens directly (e.g. "IPS LCD 144Hz 1200 nits")
    if (segments.length === 0) {
      const unitPattern = /(\d+\.?\d*)\s*(Hz|nits|mAh|MP|W|GB|mm|g|ppi|inch|fps)\b/gi;
      let match;
      while ((match = unitPattern.exec(val)) !== null) {
        segments.push({
          text: match[0],
          start: match.index,
          end: match.index + match[0].length,
          num: parseFloat(match[1]),
        });
      }
    }

    // Last resort: extract the largest bare number (useful for chipset model numbers
    // like "MTK 7400 Ultra" vs "Dimensity 7300 (4 nm)")
    if (segments.length === 0) {
      const bareNums = [...val.matchAll(/(\d{3,})/g)];
      if (bareNums.length > 0) {
        // Pick the largest number (the model number, not "4" from "4 nm")
        const best = bareNums.reduce((a, b) => parseFloat(a[1]) > parseFloat(b[1]) ? a : b);
        segments.push({
          text: best[0],
          start: best.index!,
          end: best.index! + best[0].length,
          num: parseFloat(best[1]),
        });
      }
    }

    return segments;
  };

  /** Extract unit suffix from a segment text, e.g. "144Hz" → "hz", "1200 nits" → "nits" */
  const getSegUnit = (text: string): string => {
    const m = text.match(/(Hz|nits|mAh|MP|W|GB|mm|g|ppi|inch|fps)\b/i);
    return m ? m[1].toLowerCase() : '';
  };

  const getHighlightRanges = (rowKey: string, productId: string): { start: number; end: number }[] => {
    if (SKIP_HIGHLIGHT_KEYS.has(rowKey)) return [];

    const product = products.find(p => p.id === productId);
    if (!product) return [];
    const val = product.values[rowKey] || '';
    if (!val) return [];

    const lowerIsBetter = isLowerBetter(rowKey);
    const ownSegments = splitSegments(val);
    if (ownSegments.length === 0) return [];

    const allProductSegments = products
      .filter(p => (p.values[rowKey] || '').trim())
      .map(p => ({ id: p.id, segments: splitSegments(p.values[rowKey] || '') }));

    if (allProductSegments.length < 2) return [];

    const ranges: { start: number; end: number }[] = [];

    for (let i = 0; i < ownSegments.length; i++) {
      const ownSeg = ownSegments[i];
      if (isNaN(ownSeg.num)) continue;

      const ownUnit = getSegUnit(ownSeg.text);

      // Gather comparable values: match by unit first, fall back to position
      const nthValues: { id: string; num: number }[] = [];
      for (const p of allProductSegments) {
        let matched: { num: number } | null = null;
        if (ownUnit) {
          // Find segment with same unit in this product
          const unitMatch = p.segments.find(s => getSegUnit(s.text) === ownUnit);
          if (unitMatch) matched = unitMatch;
        }
        // Fall back to positional match
        if (!matched && p.segments.length > i) {
          matched = p.segments[i];
        }
        if (matched && !isNaN(matched.num)) {
          nthValues.push({ id: p.id, num: matched.num });
        }
      }

      if (nthValues.length < 2) continue;

      const bestNum = lowerIsBetter
        ? Math.min(...nthValues.map(x => x.num))
        : Math.max(...nthValues.map(x => x.num));

      const hasDifferent = nthValues.some(x => x.num !== ownSeg.num);
      if (ownSeg.num === bestNum && hasDifferent) {
        ranges.push({ start: ownSeg.start, end: ownSeg.end });
      }
    }

    return ranges;
  };

  const renderHighlightedValue = (rowKey: string, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return null;
    const val = product.values[rowKey] || '';
    if (!val) return <span className="text-slate-300">-</span>;

    const ranges = getHighlightRanges(rowKey, productId);
    if (ranges.length === 0) return <span>{val}</span>;

    const segments: { text: string; highlight: boolean }[] = [];
    let cursor = 0;
    for (const { start, end } of ranges.sort((a, b) => a.start - b.start)) {
      if (cursor < start) segments.push({ text: val.slice(cursor, start), highlight: false });
      segments.push({ text: val.slice(start, end), highlight: true });
      cursor = end;
    }
    if (cursor < val.length) segments.push({ text: val.slice(cursor), highlight: false });

    return (
      <span>
        {segments.map((seg, i) =>
          seg.highlight
            ? <span key={i} className="text-red-600 font-semibold">{seg.text}</span>
            : <span key={i}>{seg.text}</span>
        )}
      </span>
    );
  };

  // ─── Auto-save ─────────────────────────────────────────────────

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      onSave?.(products);

      const allProducts = products.map((product, idx) => {
        // Save ALL values from product.values (not just those matching current rows)
        // This preserves any extra fields like "launch" or migrated data
        return {
          id: product.id,
          name: product.name,
          isOwnProduct: product.isOwnProduct,
          params: product.values,
          sortOrder: idx,
        };
      });

      try {
        await fetch(`/api/projects/${projectId}/products`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products: allProducts }),
        });
      } catch (err) {
        console.error('Failed to save products:', err);
      }
      onSave?.(products);
    }, 800);

    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [products, projectId, onSave]);

  // ─── SmartPaste handler ────────────────────────────────────────

  const handleSmartPaste = useCallback(
    (parsedProducts: { name: string; isOwnProduct: boolean; params: Record<string, string> }[]) => {
      const newProducts: ProductColumn[] = parsedProducts.map((p, idx) => ({
        id: `${p.isOwnProduct ? 'own' : 'comp'}-${Date.now()}-${idx}`,
        name: p.name,
        isOwnProduct: p.isOwnProduct,
        values: p.params,
      }));

      // Add custom rows for any keys not in PARAM_CATEGORIES
      const categoryKeys = new Set(PARAM_CATEGORIES.flatMap(cat => cat.fields.map(f => f.key)));
      const existingCustomKeys = new Set(customRows.map(r => r.key));
      const additionalRows: ParamRow[] = [];

      parsedProducts.forEach(p => {
        Object.keys(p.params).forEach(k => {
          if (!categoryKeys.has(k) && !existingCustomKeys.has(k) && !additionalRows.some(r => r.key === k)) {
            additionalRows.push({ key: k, nameEn: k, nameZh: k });
          }
        });
      });

      if (additionalRows.length > 0) {
        setCustomRows(prev => [...prev, ...additionalRows]);
      }
      setProducts(newProducts);
    },
    [customRows]
  );

  // ─── Add competitor from search ─────────────────────────────────

  // ─── Render helpers ────────────────────────────────────────────

  const ownProducts = products.filter(p => p.isOwnProduct);
  const competitors = products.filter(p => !p.isOwnProduct);
  const allProducts = [...ownProducts, ...competitors];
  const totalCols = allProducts.length;

  const [showManualMenu, setShowManualMenu] = useState(false);

  const renderFieldRow = (field: ParamField, isLastInCategory: boolean, isCustom: boolean = false) => {
    if (hiddenFields.has(field.key)) return null;
    return (
    <tr key={field.key} className="group/row">
      <td className="px-4 py-2 pl-6">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setHiddenFields(prev => new Set([...prev, field.key]))}
            className="opacity-0 group-hover/row:opacity-100 text-slate-300 hover:text-red-400 transition-all -ml-3 p-0.5"
            title={locale === 'zh' ? '隐藏此行' : 'Hide row'}
          >
            <X className="h-3 w-3" />
          </button>
          {isCustom ? (
            <div className="flex items-center gap-1 flex-1">
              <Input
                value={locale === 'zh' ? field.nameZh : field.nameEn}
                onChange={e => updateRowName(field.key, locale === 'zh' ? 'nameZh' : 'nameEn', e.target.value)}
                placeholder="Parameter name"
                className="h-7 text-xs border-0 p-0 focus-visible:ring-0"
              />
            </div>
          ) : (
            <span className="text-xs text-slate-500">
              {locale === 'zh' ? field.nameZh : field.nameEn}
            </span>
          )}
        </div>
      </td>
      {allProducts.map(product => {
        const cellKey = `${product.id}:${field.key}`;
        const isEditing = editingCell === cellKey;
        const isOwn = product.isOwnProduct;
        return (
          <td
            key={product.id}
            className={`px-3 py-1.5 ${isOwn ? 'bg-white shadow-sm' : 'bg-slate-50/80'} ${isLastInCategory ? 'pb-3' : ''}`}
          >
            {isEditing ? (
              <Input
                autoFocus
                value={product.values[field.key] || ''}
                onChange={e => updateValue(product.id, field.key, e.target.value)}
                onBlur={() => setEditingCell(null)}
                onKeyDown={e => e.key === 'Enter' && setEditingCell(null)}
                className="h-7 text-xs border-0 bg-slate-50/50 focus-visible:ring-slate-300"
              />
            ) : product.values[field.key] ? (
              <div
                onClick={() => setEditingCell(cellKey)}
                className="h-7 flex items-center text-xs cursor-text rounded px-2 hover:bg-slate-100/50 transition-colors"
              >
                {renderHighlightedValue(field.key, product.id)}
              </div>
            ) : (
              <div
                onClick={() => setEditingCell(cellKey)}
                className="h-7 flex items-center px-2 cursor-text"
              />

            )}
          </td>
        );
      })}
    </tr>
  );
  };

  const renderCategoryHeader = (cat: ParamCategory) => {
    const isCollapsed = collapsedCategories.has(cat.key);
    return (
      <tr
        key={`cat-${cat.key}`}
        className="cursor-pointer group"
        onClick={() => toggleCategory(cat.key)}
      >
        <td
          colSpan={totalCols + 1}
          className="px-4 py-2 bg-slate-200/60 border-t border-slate-200/80"
        >
          <div className="flex items-center gap-1.5">
            {isCollapsed
              ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            }
            <span className="text-xs font-semibold text-slate-700">
              {locale === 'zh' ? cat.nameZh : cat.nameEn}
            </span>
            <span className="text-[10px] text-slate-400">
              {cat.fields.length}
            </span>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {extraToolbarButtons}

        <SmartPaste onParsed={handleSmartPaste} projectId={projectId} footerLeft={smartPasteFooterLeft} />

        {/* Manual Input dropdown */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowManualMenu(!showManualMenu)}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('param.manualInput')}
          </Button>
          {showManualMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowManualMenu(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[140px]">
                <button
                  onClick={() => { addProduct(false); setShowManualMenu(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Plus className="h-3 w-3" />
                  {t('param.addProduct')}
                </button>
                <button
                  onClick={() => { addRow(); setShowManualMenu(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Plus className="h-3 w-3" />
                  {t('param.addRow')}
                </button>
              </div>
            </>
          )}
        </div>

        {hiddenFields.size > 0 && (
          <button
            onClick={() => setHiddenFields(new Set())}
            className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors underline"
          >
            {locale === 'zh' ? `显示已隐藏的 ${hiddenFields.size} 行` : `Show ${hiddenFields.size} hidden rows`}
          </button>
        )}

        {/* Right-aligned buttons (export, refresh) */}
        {rightToolbarButtons && (
          <div className="ml-auto flex items-center gap-2">
            {rightToolbarButtons}
          </div>
        )}

        <div className={`${rightToolbarButtons ? '' : 'flex-1'} relative flex items-center justify-center`}>
          {showEditTip && (
            <div className="absolute z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="relative bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                <button
                  onClick={() => setShowEditTip(false)}
                  className="absolute -top-1.5 -right-1.5 bg-slate-900 rounded-full w-4 h-4 flex items-center justify-center hover:bg-slate-950"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
                {locale === 'zh' ? '💡 可直接点击表格中的单元格修改参数' : '💡 Click any cell to edit parameters directly'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table with grouped categories */}
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-slate-100/50">
        <table className="w-full text-sm border-separate border-spacing-x-1.5 border-spacing-y-0 table-fixed">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-500" style={{ width: '160px' }}>
                {t('param.parameter')}
              </th>
              {ownProducts.map(product => (
                <th key={product.id} className="px-3 py-3 bg-white rounded-t-xl shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
                    <Input
                      value={product.name}
                      onChange={e => updateProductName(product.id, e.target.value)}
                      placeholder={t('param.ownProduct')}
                      className="h-7 text-xs font-semibold border-0 bg-transparent focus-visible:ring-amber-200"
                    />
                  </div>
                </th>
              ))}
              {competitors.map(product => {
                const gsmaUrl = product.name ? `https://www.gsmarena.com/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(product.name)}` : '';
                const officialUrl = product.sourceUrl || '';
                return (
                  <th key={product.id} className="px-3 py-3 bg-slate-50/80 rounded-t-xl">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Input
                        value={product.name}
                        onChange={e => updateProductName(product.id, e.target.value)}
                        placeholder={t('param.competitor')}
                        className="h-7 text-xs border-0 bg-transparent focus-visible:ring-slate-200 w-24 max-w-[6rem]"
                      />
                      {product.name && (
                        <span className="text-[10px] text-slate-400 font-normal shrink-0">{locale === 'zh' ? 'AI识别仅供参考' : 'AI may be inaccurate'}</span>
                      )}
                      {product.name && officialUrl && (
                        <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-600 font-normal transition-colors shrink-0">
                          {locale === 'zh' ? '官网' : 'Official'}<ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                      {product.name && gsmaUrl && (
                        <a href={gsmaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-600 font-normal transition-colors shrink-0">
                          GSMArena<ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                      <button
                        onClick={() => removeProduct(product.id)}
                        className="text-slate-300 hover:text-red-400 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PARAM_CATEGORIES.map(cat => {
              const isCollapsed = collapsedCategories.has(cat.key);
              return [
                renderCategoryHeader(cat),
                ...(!isCollapsed
                  ? cat.fields.map((field, idx) =>
                      renderFieldRow(field, idx === cat.fields.length - 1)
                    )
                  : []),
              ];
            })}
            {/* Custom rows */}
            {customRows.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={totalCols + 1}
                    className="px-4 py-2 bg-slate-200/60 border-t border-slate-200/80"
                  >
                    <span className="text-xs font-semibold text-slate-700">
                      {locale === 'zh' ? '自定义' : 'Custom'}
                    </span>
                  </td>
                </tr>
                {customRows.map((row, idx) =>
                  renderFieldRow(row, idx === customRows.length - 1, true)
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
