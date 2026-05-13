'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { AgentProgressStep, AgentType } from '@/types';
import { loadSettings, getAgentConfigForTask } from '@/lib/settings';

export interface UseAgentStreamOptions {
  onProgress?: (step: AgentProgressStep) => void;
  onDone?: (result: Record<string, unknown>) => void;
  onError?: (error: string) => void;
}

export function useAgentStream(agentType: AgentType, options: UseAgentStreamOptions = {}) {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AgentProgressStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Use refs for callbacks to avoid stale closures in async stream processing
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  const run = useCallback(
    async (payload: Record<string, unknown>) => {
      if (running) return;

      setRunning(true);
      setSteps([]);
      setError(null);
      abortRef.current = new AbortController();

      try {
        // Resolve AI credentials via task routing
        const settings = loadSettings();
        const aiConfig = getAgentConfigForTask(settings, agentType);

        const res = await fetch('/api/ai/agent-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentType,
            projectId: payload.projectId,
            payload,
            locale: payload.locale || settings.locale || 'zh',
            aiProvider: aiConfig?.provider,
            apiKey: aiConfig?.apiKey,
            model: aiConfig?.model,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = data.error || `Agent failed (${res.status})`;
          setError(msg);
          optionsRef.current.onError?.(msg);
          setRunning(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          const msg = 'No response stream';
          setError(msg);
          optionsRef.current.onError?.(msg);
          setRunning(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEventType = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Process complete lines (SSE messages end with \n\n)
          let newlineIdx;
          while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);

            if (line === '') {
              // Empty line = end of SSE message, reset event type
              currentEventType = '';
              continue;
            }

            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEventType) {
              const eventType = currentEventType;
              try {
                const data = JSON.parse(line.slice(6));

                if (eventType === 'progress') {
                  const progressStep: AgentProgressStep = {
                    step: data.step,
                    detail: data.detail,
                    progress: data.progress,
                    status: 'active',
                  };

                  setSteps((prev) => {
                    const existing = prev.findIndex((s) => s.step === data.step);
                    if (existing >= 0) {
                      const updated = [...prev];
                      updated[existing] = progressStep;
                      return updated;
                    }
                    const withDone = prev.map((s) =>
                      s.status === 'active' ? { ...s, status: 'done' as const } : s
                    );
                    return [...withDone, progressStep];
                  });
                  optionsRef.current.onProgress?.(progressStep);
                } else if (eventType === 'done') {
                  setSteps((prev) =>
                    prev.map((s) => ({ ...s, status: 'done' as const }))
                  );
                  optionsRef.current.onDone?.(data);
                } else if (eventType === 'error') {
                  const errMsg = data.error || 'Agent error';
                  setError(errMsg);
                  setSteps((prev) =>
                    prev.map((s) =>
                      s.status === 'active'
                        ? { ...s, status: 'error' as const }
                        : s
                    )
                  );
                  optionsRef.current.onError?.(errMsg);
                }
              } catch (parseErr) {
                console.warn('[useAgentStream] SSE parse error:', (parseErr as Error).message, 'line:', line.slice(0, 100));
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
          optionsRef.current.onError?.(err.message);
        }
      } finally {
        setRunning(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentType, running]
  );

  return { run, running, steps, error, abort };
}
