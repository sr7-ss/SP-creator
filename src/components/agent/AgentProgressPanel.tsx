'use client';

import { Search, Globe, BarChart3, Sparkles, Save, CheckCircle, AlertCircle, FileText, Loader2 } from 'lucide-react';
import { AgentProgressStep } from '@/types';

const STEP_ICONS: Record<string, typeof Search> = {
  // Research pipeline steps
  search: Search,
  fetch: Globe,
  analyze: BarChart3,
  done: CheckCircle,
  // Legacy / other agent steps
  fetch_specs: Search,
  analysis: BarChart3,
  compare: BarChart3,
  generate: Sparkles,
  creative: Sparkles,
  packaging: Sparkles,
  save: Save,
  report: FileText,
};

interface AgentProgressPanelProps {
  steps: AgentProgressStep[];
  error?: string | null;
}

export default function AgentProgressPanel({ steps, error }: AgentProgressPanelProps) {
  if (steps.length === 0 && !error) return null;

  const maxProgress = Math.max(...steps.map((s) => s.progress), 0);

  return (
    <div className="space-y-3">
      {/* Progress steps */}
      {steps.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-800 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${maxProgress * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-mono tabular-nums w-8 text-right">
              {Math.round(maxProgress * 100)}%
            </span>
          </div>

          {/* Step list — show all steps as a timeline */}
          <div className="space-y-1.5">
            {steps.map((step, idx) => {
              const Icon = STEP_ICONS[step.step] || Search;
              const isActive = step.status === 'active';
              const isDone = step.status === 'done';
              const isError = step.status === 'error';
              const isLast = idx === steps.length - 1;

              return (
                <div key={idx} className="flex items-start gap-2.5">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      isDone
                        ? 'bg-green-100'
                        : isError
                        ? 'bg-red-100'
                        : isActive
                        ? 'bg-blue-50'
                        : 'bg-slate-100'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle className="h-3 w-3 text-green-600" />
                    ) : isError ? (
                      <AlertCircle className="h-3 w-3 text-red-600" />
                    ) : isActive ? (
                      <Loader2 className="h-3 w-3 text-blue-600 animate-spin" />
                    ) : (
                      <Icon className="h-3 w-3 text-slate-400" />
                    )}
                  </div>
                  <span
                    className={`text-xs leading-5 ${
                      isDone
                        ? 'text-slate-400'
                        : isError
                        ? 'text-red-600'
                        : isActive && isLast
                        ? 'text-slate-700 font-medium'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.detail}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
