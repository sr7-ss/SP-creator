'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Header from './Header';

const DEFAULT_WIDTH = 240; // w-60 = 15rem = 240px
const MIN_WIDTH = DEFAULT_WIDTH - 30; // 210px
const MAX_WIDTH = DEFAULT_WIDTH + 30; // 270px
const STORAGE_KEY = 'sp-sidebar-width';

export default function ResizableLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullscreen = pathname === '/' || pathname === '/login' || pathname === '/register';
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);

  // Restore saved width
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const w = Number(saved);
        if (w >= MIN_WIDTH && w <= MAX_WIDTH) setSidebarWidth(w);
      }
    } catch {}
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Save to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, String(sidebarWidth));
      } catch {}
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [sidebarWidth]);

  // Fullscreen pages: no sidebar, no header
  if (isFullscreen) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar width={sidebarWidth} />
      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="fixed top-0 z-50 h-screen w-1 cursor-col-resize hover:bg-slate-300/60 active:bg-slate-400/60 transition-colors"
        style={{ left: sidebarWidth - 2 }}
      />
      <div
        style={{
          marginLeft: sidebarWidth,
          marginRight: 'var(--chat-drawer-width, 0px)',
        }}
        className="transition-[margin-right] duration-300 ease-in-out"
      >
        <Header />
        <main className="px-6 pt-0 pb-6">{children}</main>
      </div>
    </>
  );
}
