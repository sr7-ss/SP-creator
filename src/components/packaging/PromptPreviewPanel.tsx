'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Code2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/store';
import { cn } from '@/lib/utils';
import { getPackagingSystemPrompt, getPackagingUserPrompt } from '@/lib/ai/prompts/packaging';
import { SpItem } from '@/types';

interface PromptPreviewPanelProps {
  items: SpItem[];
  productName: string;
  segment?: string;
  competitorContext?: string;
  brandRules?: string[];
}

interface LayerProps {
  label: string;
  badge: string;
  badgeColor: string;
  description: string;
  content: string;
  defaultOpen?: boolean;
}

function PromptLayer({ label, badge, badgeColor, description, content, defaultOpen = false }: LayerProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
        <Badge variant="outline" className={cn('text-[10px]', badgeColor)}>{badge}</Badge>
        <span className="text-xs font-medium text-slate-700 flex-1">{label}</span>
        <span className="text-[10px] text-slate-400">{description}</span>
      </button>
      {open && (
        <div className="px-3 py-2 bg-white">
          <pre className="text-[11px] text-slate-600 whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function PromptPreviewPanel({
  items,
  productName,
  segment,
  competitorContext,
  brandRules,
}: PromptPreviewPanelProps) {
  const { locale } = useTranslation();
  const zh = locale === 'zh';
  const [visible, setVisible] = useState(false);

  // Generate the actual prompts
  const systemPrompt = getPackagingSystemPrompt(locale, brandRules);
  const spForPrompt = items.filter(i => i.l1Name || i.featureName).map(i => ({
    tier: i.tier,
    featureName: i.featureName,
    paramValue: i.paramValue,
  }));
  const userPrompt = spForPrompt.length > 0
    ? getPackagingUserPrompt({ spItems: spForPrompt, productName, segment, competitorContext })
    : (zh ? '（需要卖点分级数据后才能生成用户提示词）' : '(Need SP tier data to generate user prompt)');

  // Count tokens roughly (1 token ≈ 4 chars for English, ≈ 1.5 chars for Chinese)
  const totalChars = systemPrompt.length + userPrompt.length;
  const estimatedTokens = zh ? Math.round(totalChars / 1.5) : Math.round(totalChars / 4);

  return (
    <div className="mt-4">
      <button
        onClick={() => setVisible(!visible)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
      >
        <Code2 className="h-3.5 w-3.5" />
        {zh ? '查看提示词架构' : 'View Prompt Architecture'}
        {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>

      {visible && (
        <div className="mt-3 space-y-2 p-4 bg-slate-50/50 rounded-xl border border-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">{zh ? '提示词架构' : 'Prompt Architecture'}</span>
            </div>
            <span className="text-[10px] text-slate-400">
              ~{estimatedTokens.toLocaleString()} tokens
            </span>
          </div>

          {/* Architecture diagram */}
          <div className="text-[10px] text-slate-400 bg-white rounded-lg border p-3 font-mono mb-3">
            <p>{zh ? '请求结构：' : 'Request structure:'}</p>
            <p className="mt-1">{'┌─ System Prompt ─────────────────────┐'}</p>
            <p>{'│  1. 角色 + 任务 + 规则                │'}</p>
            <p>{'│  2. 品牌命名规则                      │'}</p>
            <p>{'│  3. 示例（few-shot） + 反例           │'}</p>
            <p>{'│  4. 输出格式（JSON Schema）           │'}</p>
            <p>{'├─ User Prompt ───────────────────────┤'}</p>
            <p>{'│  5. 产品背景 + 竞品情报               │'}</p>
            <p>{'│  6. 参考案例 + 竞品话术                │'}</p>
            <p>{'│  7. 参考风格 + 调研发现                │'}</p>
            <p>{'│  8. 待包装 SP 列表（末尾，recency）  │'}</p>
            <p>{'│  9. 指令                              │'}</p>
            <p>{'└─────────────────────────────────────┘'}</p>
          </div>

          {/* Expandable layers */}
          <div className="space-y-1.5">
            <PromptLayer
              label={zh ? '系统提示词' : 'System Prompt'}
              badge="System"
              badgeColor="text-blue-600 border-blue-200 bg-blue-50"
              description={zh ? '角色 + L1/L2/L3规则 + 品牌规则' : 'Role + L1/L2/L3 rules + Brand rules'}
              content={systemPrompt}
            />
            <PromptLayer
              label={zh ? '用户提示词' : 'User Prompt'}
              badge="User"
              badgeColor="text-green-600 border-green-200 bg-green-50"
              description={zh ? '产品上下文 + SP数据' : 'Product context + SP data'}
              content={userPrompt}
            />
            {brandRules && brandRules.length > 0 && (
              <PromptLayer
                label={zh ? '品牌命名规则' : 'Brand Naming Rules'}
                badge={zh ? '规则' : 'Rules'}
                badgeColor="text-amber-600 border-amber-200 bg-amber-50"
                description={`${brandRules.length} ${zh ? '条规则' : 'rules'}`}
                content={brandRules.join('\n')}
              />
            )}
          </div>

          {/* Status indicators */}
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200">
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full border', brandRules && brandRules.length > 0 ? 'bg-green-50 text-green-600 border-green-200' : 'bg-slate-50 text-slate-400 border-slate-200')}>
              {zh ? '品牌规则' : 'Brand Rules'}: {brandRules?.length || 0}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-slate-50 text-slate-400 border-slate-200">
              {zh ? '系列预设' : 'Series Preset'}: {zh ? '未配置' : 'Not set'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
