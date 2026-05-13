'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Send, X, Loader2, Trash2, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/store';
import { loadSettings, getConfigForTask } from '@/lib/settings';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatSidebarProps {
  projectContext?: string;
  projectId?: string;
}

const DEFAULT_DRAWER_WIDTH = 380;
const MIN_DRAWER_WIDTH = 280;
const MAX_DRAWER_WIDTH_VW = 50; // 50vw
const STORAGE_KEY_OPEN = 'chat_drawer_open';
const STORAGE_KEY_WIDTH = 'chat_drawer_width';
const STORAGE_KEY_BTN_POS = 'chat_btn_pos';

/** Set CSS variable so ResizableLayout can shrink the main area */
function setChatDrawerVar(width: number) {
  document.documentElement.style.setProperty('--chat-drawer-width', `${width}px`);
}

function clearChatDrawerVar() {
  document.documentElement.style.setProperty('--chat-drawer-width', '0px');
}

export default function ChatSidebar({ projectContext, projectId }: ChatSidebarProps) {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  // ─── Drawer state ──────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_DRAWER_WIDTH);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_DRAWER_WIDTH);

  // ─── Floating button drag state ────────────────────────────
  const [btnPos, setBtnPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  const btnDragging = useRef(false);
  const btnDragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const btnDidMove = useRef(false);

  // ─── Chat state ────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ─── Restore persisted state ───────────────────────────────
  useEffect(() => {
    try {
      const savedOpen = localStorage.getItem(STORAGE_KEY_OPEN);
      const savedWidth = localStorage.getItem(STORAGE_KEY_WIDTH);
      const savedBtnPos = localStorage.getItem(STORAGE_KEY_BTN_POS);
      if (savedWidth) {
        const w = Number(savedWidth);
        if (w >= MIN_DRAWER_WIDTH && w <= window.innerWidth * MAX_DRAWER_WIDTH_VW / 100) {
          setDrawerWidth(w);
        }
      }
      if (savedBtnPos) {
        const pos = JSON.parse(savedBtnPos);
        if (typeof pos.x === 'number' && typeof pos.y === 'number') {
          // Clamp to viewport
          const cx = Math.min(Math.max(0, pos.x), window.innerWidth - 40);
          const cy = Math.min(Math.max(0, pos.y), window.innerHeight - 40);
          setBtnPos({ x: cx, y: cy });
        }
      }
      if (savedOpen === 'true') {
        setOpen(true);
      }
    } catch { /* ignore */ }
  }, []);

  // ─── Sync CSS var + persist open state ─────────────────────
  useEffect(() => {
    if (open) {
      setChatDrawerVar(drawerWidth);
    } else {
      clearChatDrawerVar();
    }
    try { localStorage.setItem(STORAGE_KEY_OPEN, String(open)); } catch {}
    return () => clearChatDrawerVar();
  }, [open, drawerWidth]);

  // ─── Drag resize ──────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = drawerWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [drawerWidth]);

  useEffect(() => {
    const maxPx = () => window.innerWidth * MAX_DRAWER_WIDTH_VW / 100;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // Dragging left edge → moving left = wider
      const delta = dragStartX.current - e.clientX;
      const newWidth = Math.min(maxPx(), Math.max(MIN_DRAWER_WIDTH, dragStartWidth.current + delta));
      setDrawerWidth(newWidth);
      setChatDrawerVar(newWidth);
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem(STORAGE_KEY_WIDTH, String(drawerWidth)); } catch {}
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [drawerWidth]);

  // ─── Floating button drag ─────────────────────────────────
  const onBtnPointerDown = useCallback((e: React.PointerEvent) => {
    btnDragging.current = true;
    btnDidMove.current = false;
    const curX = btnPos.x >= 0 ? btnPos.x : window.innerWidth - 56;
    const curY = btnPos.y >= 0 ? btnPos.y : 16;
    btnDragStart.current = { x: e.clientX, y: e.clientY, posX: curX, posY: curY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [btnPos]);

  const onBtnPointerMove = useCallback((e: React.PointerEvent) => {
    if (!btnDragging.current) return;
    const dx = e.clientX - btnDragStart.current.x;
    const dy = e.clientY - btnDragStart.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) btnDidMove.current = true;
    const nx = Math.min(Math.max(0, btnDragStart.current.posX + dx), window.innerWidth - 40);
    const ny = Math.min(Math.max(0, btnDragStart.current.posY + dy), window.innerHeight - 40);
    setBtnPos({ x: nx, y: ny });
  }, []);

  const onBtnPointerUp = useCallback(() => {
    btnDragging.current = false;
    if (btnDidMove.current) {
      // Save position
      try { localStorage.setItem(STORAGE_KEY_BTN_POS, JSON.stringify(btnPos)); } catch {}
    } else {
      // Was a click, not a drag → toggle drawer
      setOpen(true);
    }
  }, [btnPos]);

  // ─── Chat history persistence ──────────────────────────────
  const storageKey = `chat_history_${projectId || 'global'}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setMessages(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
    }
  }, [messages, storageKey]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 350);
  }, [open]);

  // ─── Send message ─────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    const settings = loadSettings();
    const config = getConfigForTask(settings, 'analysis');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          projectContext,
          locale,
          aiProvider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Chat failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'delta') {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + data.content };
                }
                return updated;
              });
            } else if (data.type === 'error') {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: `Error: ${data.error}` };
                }
                return updated;
              });
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = { ...last, content: `Error: ${(err as Error).message}` };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages, projectContext, locale]);

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(storageKey);
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  return (
    <>
      {/* Draggable toggle button */}
      {!open && (
        <div
          onPointerDown={onBtnPointerDown}
          onPointerMove={onBtnPointerMove}
          onPointerUp={onBtnPointerUp}
          className="fixed z-50 w-10 h-10 rounded-full bg-slate-800 text-white shadow-lg hover:bg-slate-700 transition-shadow hover:shadow-xl flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none"
          style={{
            left: btnPos.x >= 0 ? btnPos.x : undefined,
            right: btnPos.x >= 0 ? undefined : 16,
            top: btnPos.y >= 0 ? btnPos.y : 16,
          }}
          title={zh ? 'AI 助手（可拖拽移动）' : 'AI Chat (drag to move)'}
        >
          <Bot className="h-5 w-5 pointer-events-none" />
        </div>
      )}

      {/* Drawer panel */}
      <div
        className={cn(
          'fixed top-0 right-0 z-40 h-screen bg-white border-l border-slate-200 shadow-xl flex flex-col transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ width: drawerWidth }}
      >
        {/* Drag handle — left edge */}
        <div
          onMouseDown={onDragStart}
          className="absolute left-0 top-0 h-full w-[5px] cursor-col-resize z-50 group"
        >
          <div className="absolute inset-y-0 left-0 w-[5px] transition-colors group-hover:bg-blue-400/40 group-active:bg-blue-500/50" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-medium text-slate-700">{zh ? 'AI 助手' : 'AI Chat'}</span>
            {projectContext && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200">
                {zh ? '已加载上下文' : 'Context loaded'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={clearHistory} className="text-slate-400 hover:text-slate-600 p-1" title={zh ? '清空' : 'Clear'}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 p-1" title={zh ? '收起' : 'Close'}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <MessageSquare className="h-8 w-8 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">{zh ? '有什么可以帮你的？' : 'How can I help?'}</p>
              <p className="text-xs text-slate-300 mt-1">
                {zh ? '我了解你当前项目的参数、分析和卖点数据' : 'I have context about your current project data'}
              </p>

              {/* Quick starter prompts */}
              <div className="mt-6 space-y-2">
                {(zh ? [
                  '帮我分析一下哪些卖点最有竞争力',
                  '这个价位段用户最关注什么？',
                  '帮我优化电池卖点的包装文案',
                  '竞品在拍照方面是怎么宣传的？',
                ] : [
                  'Which selling points are most competitive?',
                  'What do users care about in this segment?',
                  'Help optimize battery packaging copy',
                  'How do competitors market their camera?',
                ]).map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setInput(prompt); }}
                    className="w-full text-left text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={cn(
                'max-w-[90%] rounded-xl px-3 py-2',
                msg.role === 'user'
                  ? 'ml-auto bg-slate-800 text-white'
                  : 'mr-auto bg-slate-100 text-slate-700'
              )}
            >
              <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.content || (isStreaming ? '...' : '')}</p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-100 px-4 py-3 bg-white flex-shrink-0">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={zh ? '输入问题...' : 'Ask a question...'}
              className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300 min-h-[40px] max-h-[120px]"
              rows={1}
            />
            {isStreaming ? (
              <Button onClick={stopStreaming} variant="outline" size="sm" className="self-end px-3">
                <X className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={sendMessage}
                disabled={!input.trim()}
                className="self-end bg-slate-800 hover:bg-slate-700 px-3"
                size="sm"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
