/**
 * Anonymous behavior tracking.
 *
 * Three rules:
 *   1. Privacy mode → tracking is hard-disabled, period.
 *   2. Otherwise, only fire if the user has explicitly opted in.
 *   3. Never include user-generated content; props are bounded metadata only.
 */

import { loadSettings } from '@/lib/settings';

export type TrackProps = Record<string, string | number | boolean | null>;

const SESSION_KEY = 'sp-track-session';

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function shouldTrack(): boolean {
  if (typeof window === 'undefined') return false;
  const settings = loadSettings();
  if (settings.privacyMode) return false;
  return !!settings.analyticsOptIn;
}

/**
 * Fire and forget. Never throws, never blocks UI.
 * Pass only bounded metadata in props (numbers, short labels, durations).
 */
export function track(name: string, props?: TrackProps): void {
  if (!shouldTrack()) return;

  const payload = {
    name,
    sessionId: getSessionId(),
    path: window.location.pathname,
    props: props || null,
  };

  // sendBeacon when available — lets the request survive page unload
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/track', blob);
      return;
    }
  } catch {
    // fall through to fetch
  }

  fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

/** Track a page view — call from a layout effect on route change. */
export function trackPageView(path?: string): void {
  track('page_view', { path: path || (typeof window !== 'undefined' ? window.location.pathname : '') });
}
