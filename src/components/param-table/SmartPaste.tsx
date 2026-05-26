'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Wand2, Upload, Loader2, X, RotateCcw, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
/* eslint-disable @next/next/no-img-element */
import { useTranslation } from '@/lib/store';
import { loadSettings, getConfigForTask } from '@/lib/settings';
import { parseProductsFromText } from '@/lib/analysis/text-parser';

interface ParsedProduct {
  name: string;
  isOwnProduct: boolean;
  params: Record<string, string>;
}

interface SmartPasteProps {
  onParsed: (products: ParsedProduct[]) => void;
  variant?: 'default' | 'large' | 'redo';
  projectId?: string;
  /**
   * When true, keep the current text/image draft after a successful parse
   * (useful for "redo" so users can re-run without re-uploading).
   */
  keepDraftOnSuccess?: boolean;
  /** Optional React node rendered at the bottom-left of the dialog (e.g. ModelSelector) */
  footerLeft?: React.ReactNode;
}

const PASTE_TIP_KEY = 'sp-smart-paste-tip-seen';

function getDraftKey(projectId?: string) {
  return projectId ? `sp-paste-draft-${projectId}` : null;
}

export default function SmartPaste({
  onParsed,
  variant = 'default',
  projectId,
  keepDraftOnSuccess = false,
  footerLeft,
}: SmartPasteProps) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const draftLoaded = useRef(false);

  // Restore draft on mount
  useEffect(() => {
    const key = getDraftKey(projectId);
    if (!key) { draftLoaded.current = true; return; }
    try {
      const draft = localStorage.getItem(key);
      if (draft) {
        const { text: savedText, imagePreview: savedPreview, imageBase64: savedBase64 } = JSON.parse(draft);
        if (savedText) setText(savedText);
        if (savedPreview) setImagePreview(savedPreview);
        if (savedBase64) setImageBase64(savedBase64);
      }
    } catch {}
    // Mark loaded after a tick so save effect doesn't wipe the draft on mount
    setTimeout(() => { draftLoaded.current = true; }, 0);
  }, [projectId]);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showPasteTip, setShowPasteTip] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // First-time tooltip
  const [showTooltip, setShowTooltip] = useState(false);
  useEffect(() => {
    const hasSeenTooltip = localStorage.getItem('sp-smart-paste-tooltip-seen');
    if (!hasSeenTooltip) {
      const timer = setTimeout(() => setShowTooltip(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);
  // Auto-save draft when content changes (skip until initial restore is done)
  useEffect(() => {
    if (!draftLoaded.current) return;
    const key = getDraftKey(projectId);
    if (!key) return;
    if (!text && !imageBase64) {
      localStorage.removeItem(key);
    } else {
      try {
        localStorage.setItem(key, JSON.stringify({ text, imagePreview, imageBase64 }));
      } catch {}
    }
  }, [text, imagePreview, imageBase64, projectId]);

  const dismissTooltip = () => {
    setShowTooltip(false);
    localStorage.setItem('sp-smart-paste-tooltip-seen', 'true');
  };

  // Show paste tip bubble inside dialog on first open
  useEffect(() => {
    if (open) {
      const seen = localStorage.getItem(PASTE_TIP_KEY);
      if (!seen) {
        setShowPasteTip(true);
      }
    } else {
      setShowPasteTip(false);
    }
  }, [open]);

  const dismissPasteTip = () => {
    setShowPasteTip(false);
    localStorage.setItem(PASTE_TIP_KEY, 'true');
  };

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (val) dismissTooltip();
  };

  const processImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(',')[1]);
    };
    reader.readAsDataURL(file);
    // Dismiss paste tip once they successfully paste/upload an image
    dismissPasteTip();
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  // Paste handler — intercept image pastes in the textarea
  const handlePaste = useCallback((e: ClipboardEvent | React.ClipboardEvent) => {
    const clipboardData = 'clipboardData' in e ? e.clipboardData : null;
    if (!clipboardData) return;
    const items = clipboardData.items;
    if (items) {
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) processImageFile(file);
          return;
        }
      }
    }
  }, [processImageFile]);

  // Global paste listener when dialog is open
  useEffect(() => {
    if (!open) return;
    const handler = (e: ClipboardEvent) => handlePaste(e);
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [open, handlePaste]);

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) processImageFile(file);
  };

  const clearImage = () => { setImagePreview(null); setImageBase64(null); };

  // Try client-side rule parsing (instant, no API needed)
  const tryLocalParse = useCallback((inputText: string): boolean => {
    if (!inputText.trim()) return false;
    const result = parseProductsFromText(inputText);
    console.log('[SmartPaste] tryLocalParse result:', result ? `${result.length} products, params: ${result.map(p => Object.keys(p.params).length).join(',')}` : 'null (will fallback to AI)');
    if (result && result.length >= 1) {
      onParsed(result);
      setOpen(false);
      if (!keepDraftOnSuccess) {
        setText('');
        clearImage();
        const key = getDraftKey(projectId);
        if (key) localStorage.removeItem(key);
      }
      return true;
    }
    return false;
  }, [onParsed, keepDraftOnSuccess, projectId]);

  // Auto-parse on text change (debounced)
  const autoParseRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!text || text.length < 50) return; // need substantial text
    if (imageBase64) return; // if image is present, don't auto-parse text

    if (autoParseRef.current) clearTimeout(autoParseRef.current);
    autoParseRef.current = setTimeout(() => {
      tryLocalParse(text);
    }, 600);

    return () => { if (autoParseRef.current) clearTimeout(autoParseRef.current); };
  }, [text, imageBase64, tryLocalParse]);

  const handleParse = async () => {
    if (!text && !imageBase64) {
      setError(locale === 'zh' ? '请输入文本或粘贴图片' : 'Please enter text or paste an image.');
      return;
    }

    // Try local parse first (instant, no API needed)
    if (text && tryLocalParse(text)) {
      return;
    }

    // Local parse failed — log the text for debugging
    if (text) {
      console.log('[SmartPaste] Local parse FAILED, text preview:', JSON.stringify(text.slice(0, 200)));
      console.log('[SmartPaste] Lines:', text.split('\n').filter(l => l.trim()).length, '| Has tabs:', text.includes('\t'), '| Has pipes:', text.includes('|'), '| Has colons:', /[：:]/.test(text));
    }

    // Local parse failed — fall back to API
    const settings = loadSettings();
    const config = getConfigForTask(settings, 'parse-params');

    setIsParsing(true);
    setError(null);

    try {
      // Privacy mode + text-only: call the model directly from the browser so
      // the raw spec text never hits our server.
      let products: ParsedProduct[] | null = null;
      if (settings.privacyMode && text && !imageBase64) {
        const { callAIClient, MissingApiKeyError } = await import('@/lib/ai/client-call');
        const { PARSE_PARAMS_SYSTEM_PROMPT, normalizeParsedProducts } = await import('@/lib/ai/prompts/parse-params');
        try {
          const raw = await callAIClient('parse-params', [
            { role: 'system', content: PARSE_PARAMS_SYSTEM_PROMPT },
            { role: 'user', content: `Extract product parameters from this text:\n\n${text}` },
          ]);
          products = normalizeParsedProducts(raw);
        } catch (err) {
          if (err instanceof MissingApiKeyError) {
            throw new Error(locale === 'zh' ? '请先在设置中配置 API Key' : 'Please configure your API key in Settings');
          }
          throw err;
        }
      } else {
        const res = await fetch('/api/ai/parse-params', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text || undefined,
            imageBase64: imageBase64 || undefined,
            aiProvider: config.provider,
            apiKey: config.apiKey || undefined,
            model: config.model || undefined,
          }),
        });

        if (!res.ok) {
          if (res.status === 503 || res.status === 502) {
            throw new Error(locale === 'zh' ? '服务提供商临时过载，请稍后切换AI大模型后再试～' : 'AI provider is temporarily overloaded. Please switch models and retry.');
          }
          const data = await res.json();
          throw new Error(data.error || 'Parsing failed');
        }

        const result = await res.json();
        console.log('[SmartPaste] API response:', JSON.stringify(result).slice(0, 500));

        if (Array.isArray(result.products) && result.products.length > 0) {
          products = result.products;
        } else if (Array.isArray(result) && result.length > 0) {
          products = result;
        } else if (result.params && typeof result.params === 'object') {
          products = [{ name: result.name || 'Product', isOwnProduct: true, params: result.params }];
        }
      }

      // Single product → default to own product
      if (products && products.length === 1) {
        products[0].isOwnProduct = true;
      }

      if (products && products.length > 0) {
        onParsed(products);
        setOpen(false);
        if (!keepDraftOnSuccess) {
          setText('');
          clearImage();
          const key = getDraftKey(projectId);
          if (key) localStorage.removeItem(key);
        }
      } else {
        console.warn('[SmartPaste] No products found in response');
        setError(locale === 'zh' ? '未从输入中识别到产品参数，请重试' : 'No products found in the input. Please retry.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Parsing failed';
      // If AI failed and this was text-only, hint about format
      if (!imageBase64 && text) {
        const hint = locale === 'zh'
          ? `${msg}\n\n💡 文本格式提示：请使用 Tab/竖线/冒号分隔参数，如：\n芯片: Dimensity 7300\n电池: 7000mAh`
          : `${msg}\n\n💡 Format tip: Use tab/pipe/colon separators, e.g.:\nChipset: Dimensity 7300\nBattery: 7000mAh`;
        setError(hint);
      } else {
        setError(msg);
      }
    } finally {
      setIsParsing(false);
    }
  };

  const hasContent = !!text || !!imageBase64;

  return (
    <div className={variant === 'large' ? "relative w-full" : "relative"}>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          className={variant === 'large'
            ? "flex flex-col items-center justify-center gap-3 rounded-2xl bg-slate-800 w-full px-10 py-10 text-lg font-medium text-white hover:bg-slate-700 shadow-lg transition-all"
            : variant === 'redo'
            ? "inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            : "inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 transition-colors"
          }
        >
          {variant === 'redo' ? (
            <RotateCcw className="h-3.5 w-3.5" />
          ) : variant === 'large' ? (
            <Image className="h-7 w-7" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          {variant === 'redo'
            ? (locale === 'zh' ? '重新识别' : 'Re-parse')
            : variant === 'large'
            ? t('param.pasteImage')
            : t('param.inputParams')
          }
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{t('param.inputParams')}</DialogTitle>
            <p className="text-xs text-slate-400">{t('param.smartPasteDesc')}</p>
          </DialogHeader>

          {/* Unified input area */}
          <div className="relative mt-2">
            <div
              className={`relative rounded-xl border-2 border-dashed transition-all ${
                isDragOver
                  ? 'border-slate-500 bg-slate-50/50'
                  : 'border-slate-200 bg-slate-50/30 focus-within:border-slate-400 focus-within:bg-white'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Image preview above textarea */}
              {imagePreview && (
                <div className="relative p-3 pb-0">
                  <img
                    src={imagePreview}
                    alt="Uploaded"
                    className="w-full max-h-40 rounded-lg object-contain bg-white border border-slate-100"
                  />
                  <button
                    onClick={clearImage}
                    className="absolute top-4 right-4 bg-white/90 rounded-full p-1.5 text-slate-400 hover:text-red-500 shadow-sm transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={locale === 'zh'
                  ? '输入或粘贴产品参数文本，也可直接粘贴图片...'
                  : 'Type or paste product specs, or paste an image...'
                }
                className={`w-full bg-transparent px-4 py-3 text-sm placeholder:text-slate-300 focus:outline-none resize-none ${
                  imagePreview ? 'h-20' : 'h-48'
                }`}
              />

              {/* Bottom bar: upload button */}
              <div className="flex items-center justify-between px-3 pb-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-700 transition-colors px-1.5 py-1 rounded-md hover:bg-slate-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {locale === 'zh' ? '上传图片' : 'Upload image'}
                </button>
                <span className="text-[10px] text-slate-300">
                  Ctrl+V / ⌘V
                </span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            {/* Paste tip bubble — shown on first use */}
            {showPasteTip && (
              <div className="absolute -top-2 right-4 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="relative bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                  <button
                    onClick={dismissPasteTip}
                    className="absolute -top-1.5 -right-1.5 bg-slate-900 rounded-full w-4 h-4 flex items-center justify-center hover:bg-slate-950"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                  {locale === 'zh' ? '💡 右键即可粘贴图片' : '💡 Right-click to paste images'}
                  {/* Arrow pointing down */}
                  <div className="absolute right-6 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-800" />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 mt-2 whitespace-pre-line">{error}</p>
          )}

          <div className="flex items-center justify-between mt-3">
            <div>{footerLeft}</div>
            <Button
              onClick={handleParse}
              disabled={isParsing || !hasContent}
              className="gap-2 bg-slate-800 hover:bg-slate-900"
              size="sm"
            >
              {isParsing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {isParsing
                ? (locale === 'zh' ? '分析中...' : 'Analyzing...')
                : (locale === 'zh' ? '开始分析' : 'Start Analysis')
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* First-time tooltip bubble on trigger button */}
      {showTooltip && (
        <div className="absolute left-0 bottom-full mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="relative bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
            <button
              onClick={dismissTooltip}
              className="absolute -top-1.5 -right-1.5 bg-slate-900 rounded-full w-4 h-4 flex items-center justify-center hover:bg-slate-950"
            >
              <X className="h-2.5 w-2.5" />
            </button>
            {locale === 'zh'
              ? '可以直接粘贴长段文字或图片，AI自动识别参数'
              : 'Paste text or images, AI auto-parses parameters'}
            <div className="absolute left-4 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-800" />
          </div>
        </div>
      )}
    </div>
  );
}
