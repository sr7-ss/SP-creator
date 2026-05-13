'use client';

import { useRef, useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, X } from 'lucide-react';
import { useTranslation } from '@/lib/store';
import { parseUploadedFile, ParsedFile } from '@/lib/utils/file-parser';

interface UploadSectionProps {
  onFileLoaded: (parsed: ParsedFile, fileName: string) => void;
}

export default function UploadSection({ onFileLoaded }: UploadSectionProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const parsed = await parseUploadedFile(file);
      onFileLoaded(parsed, file.name);
    } catch {
      setError(t('reviews.parseError'));
    } finally {
      setLoading(false);
    }
  }, [onFileLoaded, t]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${dragging
            ? 'border-[#1e2a3a]/40 bg-[#1e2a3a]/5'
            : 'border-slate-200 hover:border-slate-300 bg-white'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          onChange={onChange}
          className="hidden"
        />
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <FileSpreadsheet className="h-8 w-8 text-slate-400 animate-pulse" />
            <span className="text-sm text-slate-500">{t('reviews.analyzing')}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-slate-400" />
            <span className="text-sm text-slate-600">{t('reviews.dragDrop')}</span>
            <span className="text-[10px] text-slate-400">{t('reviews.supportedFormats')}</span>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
          <X className="h-3 w-3" />
          {error}
        </div>
      )}
    </div>
  );
}
