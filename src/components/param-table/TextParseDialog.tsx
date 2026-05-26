'use client';

import { useState, useRef, useEffect } from 'react';
import { Wand2, Loader2, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useTranslation } from '@/lib/store';
import { parseProductsFromText, ParseDebugInfo } from '@/lib/analysis/text-parser';

interface ParsedProduct {
  name: string;
  isOwnProduct: boolean;
  params: Record<string, string>;
}

interface TextParseDialogProps {
  onParsed: (products: ParsedProduct[]) => void;
  /** Fallback: show empty manual table */
  onManualInput: () => void;
  projectId?: string;
}

const DRAFT_KEY_PREFIX = 'sp-text-parse-draft-';

export default function TextParseDialog({
  onParsed,
  onManualInput,
  projectId,
}: TextParseDialogProps) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftKey = projectId ? `${DRAFT_KEY_PREFIX}${projectId}` : null;

  // Restore draft
  useEffect(() => {
    if (!draftKey) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) setText(saved);
    } catch {}
  }, [draftKey]);

  // Save draft
  useEffect(() => {
    if (!draftKey) return;
    if (text) {
      try { localStorage.setItem(draftKey, text); } catch {}
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [text, draftKey]);

  // Focus textarea on open
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  const handleParse = () => {
    if (!text.trim()) {
      setError(locale === 'zh' ? '请输入参数文本' : 'Please enter parameter text.');
      return;
    }

    setIsParsing(true);
    setError(null);
    setDebugInfo(null);

    setTimeout(() => {
      const debug: ParseDebugInfo = {
        lines: 0,
        separator: null,
        tableProducts: 0,
        tableMatchedParams: 0,
        singleTabParams: 0,
        singleColonParams: 0,
        singleKwParams: 0,
        singleValueParams: 0,
        unmatchedSamples: [],
      };

      const result = parseProductsFromText(text, debug);

      console.log('[TextParseDialog] Debug:', debug);
      console.log('[TextParseDialog] Result:', result);

      if (result && result.length >= 1) {
        onParsed(result);
        setOpen(false);
        setText('');
        setDebugInfo(null);
        if (draftKey) localStorage.removeItem(draftKey);
      } else {
        // Build diagnostic message
        const zh = locale === 'zh';
        const diagParts: string[] = [];
        diagParts.push(zh ? `检测到 ${debug.lines} 行` : `Detected ${debug.lines} lines`);
        diagParts.push(zh ? `分隔符: ${debug.separator || '无'}` : `Separator: ${debug.separator || 'none'}`);
        if (debug.tableMatchedParams > 0) {
          diagParts.push(zh ? `表格匹配: ${debug.tableMatchedParams} 个参数, ${debug.tableProducts} 个产品` : `Table: ${debug.tableMatchedParams} params, ${debug.tableProducts} products`);
        }
        if (debug.singleColonParams > 0) {
          diagParts.push(zh ? `冒号格式: ${debug.singleColonParams} 个参数` : `Colon: ${debug.singleColonParams} params`);
        }
        if (debug.singleValueParams > 0) {
          diagParts.push(zh ? `值匹配: ${debug.singleValueParams} 个参数` : `Value: ${debug.singleValueParams} params`);
        }
        if (debug.unmatchedSamples.length > 0) {
          diagParts.push(zh ? `未识别行: "${debug.unmatchedSamples.slice(0, 3).join('", "')}"` : `Unmatched: "${debug.unmatchedSamples.slice(0, 3).join('", "')}"`);
        }

        setDebugInfo(diagParts.join(' | '));

        setError(
          zh
            ? '未能识别足够参数（至少需要 2 个）。支持格式：\n\n1. 表格（Tab 或竖线分隔）:\n参数 | 产品A | 产品B\n芯片 | 天玑7300 | 骁龙695\n\n2. 键值（冒号分隔）:\n芯片: 天玑7300\n电池: 7000mAh\n充电: 45W'
            : 'Could not parse enough parameters (need at least 2). Supported formats:\n\n1. Table (tab/pipe):\nParam | Product A | Product B\n\n2. Key-value (colon):\nChipset: Dimensity 7300\nBattery: 7000mAh'
        );
      }
      setIsParsing(false);
    }, 50);
  };

  const handleManualFallback = () => {
    setOpen(false);
    onManualInput();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white w-full py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:shadow-sm transition-all"
      >
        <Keyboard className="h-4 w-4" />
        {t('param.inputParams')}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{t('param.inputParams')}</DialogTitle>
          <p className="text-xs text-slate-400">
            {locale === 'zh'
              ? '粘贴产品参数文本，自动识别并填入表格（无需 AI）'
              : 'Paste product specs text, auto-parsed into table (no AI needed)'}
          </p>
        </DialogHeader>

        <div className="mt-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); setDebugInfo(null); }}
            placeholder={locale === 'zh'
              ? '粘贴产品参数文本...\n\n示例格式：\n参数 | 产品A | 产品B\n芯片 | 天玑7300 | 骁龙695\n电池 | 7000mAh | 5000mAh\n\n或：\n芯片: 天玑7300\n电池: 7000mAh\n充电: 45W'
              : 'Paste product specs...\n\nExample:\nParam | Product A | Product B\nChipset | Dimensity 7300 | Snapdragon 695\nBattery | 7000mAh | 5000mAh'
            }
            className="w-full rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/30 px-4 py-3 text-sm placeholder:text-slate-300 focus:outline-none focus:border-slate-400 focus:bg-white resize-none h-52 transition-all"
          />
        </div>

        {error && (
          <p className="text-xs text-red-500 mt-2 whitespace-pre-line">{error}</p>
        )}
        {debugInfo && (
          <p className="text-[10px] text-slate-400 mt-1 font-mono">{debugInfo}</p>
        )}

        <div className="flex items-center justify-between mt-3">
          <button
            onClick={handleManualFallback}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {locale === 'zh' ? '手动填写表格 →' : 'Manual input →'}
          </button>
          <Button
            onClick={handleParse}
            disabled={isParsing || !text.trim()}
            className="gap-2 bg-slate-800 hover:bg-slate-900"
            size="sm"
          >
            {isParsing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {locale === 'zh' ? '识别参数' : 'Parse'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
