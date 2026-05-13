'use client';

import { Bot, AlertCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/lib/store';
import { AIProvider, AI_PROVIDER_META } from '@/types';
import { AppSettings, saveSettings } from '@/lib/settings';

interface ModelSelectorProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  /** Compact mode: smaller selectors for embedding in dialogs */
  compact?: boolean;
}

const providerKeys = Object.keys(AI_PROVIDER_META) as AIProvider[];

export default function ModelSelector({ settings, onSettingsChange, compact }: ModelSelectorProps) {
  const { t } = useTranslation();
  const currentProvider = settings.activeProvider;
  const providerConfig = settings.aiProviders[currentProvider];
  const hasApiKey = !!providerConfig?.apiKey;
  const meta = AI_PROVIDER_META[currentProvider];
  const currentModel = settings.activeModel || meta.defaultModel;

  const handleProviderChange = (provider: string | null) => {
    if (!provider) return;
    const p = provider as AIProvider;
    const newMeta = AI_PROVIDER_META[p];
    const updated = {
      ...settings,
      activeProvider: p,
      activeModel: newMeta.defaultModel,
    };
    saveSettings(updated);
    onSettingsChange(updated);
  };

  const handleModelChange = (model: string | null) => {
    if (!model) return;
    const updated = { ...settings, activeModel: model };
    saveSettings(updated);
    onSettingsChange(updated);
  };

  return (
    <div className={
      compact
        ? "flex items-center gap-1.5 rounded-lg bg-slate-50/80 border border-slate-200/60 px-2 py-1"
        : "flex items-center gap-3 rounded-xl bg-slate-50/80 border border-slate-200/60 px-4 py-2.5"
    }>
      <Bot className={compact ? "h-3 w-3 text-slate-400 shrink-0" : "h-4 w-4 text-slate-400 shrink-0"} />

      {/* Provider */}
      <Select value={currentProvider} onValueChange={handleProviderChange}>
        <SelectTrigger className={compact ? "w-[90px] h-6 text-[10px] bg-white border-slate-200" : "w-[160px] h-8 text-xs bg-white border-slate-200"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providerKeys.map((key) => (
            <SelectItem key={key} value={key} className={compact ? "text-[10px]" : "text-xs"}>
              {AI_PROVIDER_META[key].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Model */}
      <Select value={currentModel} onValueChange={handleModelChange}>
        <SelectTrigger className={compact ? "w-[130px] h-6 text-[10px] bg-white border-slate-200 font-mono" : "w-[240px] h-8 text-xs bg-white border-slate-200 font-mono"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {meta.models.map((m) => (
            <SelectItem key={m} value={m} className={compact ? "text-[10px] font-mono" : "text-xs font-mono"}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* API Key warning */}
      {!hasApiKey && (
        <div className="flex items-center gap-1 text-amber-600">
          <AlertCircle className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          <span className={compact ? "text-[9px] whitespace-nowrap" : "text-[11px] whitespace-nowrap"}>{t('model.noApiKey')}</span>
        </div>
      )}
    </div>
  );
}
