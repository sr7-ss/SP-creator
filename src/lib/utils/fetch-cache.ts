/**
 * Simple in-memory fetch cache for client-side navigation.
 * Caches GET responses for a short TTL so navigating back/forward is instant.
 * Stale-while-revalidate: returns cached data immediately, then refreshes in background.
 */

interface CacheEntry {
  data: unknown;
  timestamp: number;
  promise?: Promise<unknown>;
}

const cache = new Map<string, CacheEntry>();
const STALE_TTL = 30_000;  // 30s — return cached data immediately
const MAX_TTL = 300_000;   // 5min — hard expiry

/**
 * Fetch with cache. Returns cached data instantly if available (< STALE_TTL),
 * and revalidates in background. If cache is older than MAX_TTL, waits for fresh data.
 */
export async function cachedFetch<T>(url: string, options?: { forceRefresh?: boolean }): Promise<T> {
  const entry = cache.get(url);
  const now = Date.now();

  // If we have fresh cached data and no force refresh, return immediately
  if (entry && !options?.forceRefresh && now - entry.timestamp < STALE_TTL) {
    // Background revalidate if > half TTL
    if (now - entry.timestamp > STALE_TTL / 2) {
      revalidate(url);
    }
    return entry.data as T;
  }

  // If we have stale but usable data, return it and revalidate
  if (entry && !options?.forceRefresh && now - entry.timestamp < MAX_TTL) {
    revalidate(url);
    return entry.data as T;
  }

  // No cache or expired — fetch fresh
  return revalidate(url) as Promise<T>;
}

async function revalidate(url: string): Promise<unknown> {
  const entry = cache.get(url);
  // Deduplicate: if a fetch is already in flight, wait for it
  if (entry?.promise) return entry.promise;

  const promise = fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      return res.json();
    })
    .then(data => {
      cache.set(url, { data, timestamp: Date.now() });
      return data;
    })
    .catch(err => {
      // On error, keep stale data if available
      const existing = cache.get(url);
      if (existing) {
        cache.set(url, { ...existing, promise: undefined });
      }
      throw err;
    })
    .finally(() => {
      const existing = cache.get(url);
      if (existing) {
        cache.set(url, { ...existing, promise: undefined });
      }
    });

  const existing = cache.get(url);
  if (existing) {
    cache.set(url, { ...existing, promise });
  } else {
    cache.set(url, { data: null, timestamp: 0, promise });
  }

  return promise;
}

/** Invalidate a specific URL or prefix */
export function invalidateCache(urlOrPrefix: string) {
  for (const key of cache.keys()) {
    if (key === urlOrPrefix || key.startsWith(urlOrPrefix)) {
      cache.delete(key);
    }
  }
}

/** Prefetch a URL into cache (fire-and-forget) */
export function prefetchUrl(url: string) {
  const entry = cache.get(url);
  if (entry && Date.now() - entry.timestamp < STALE_TTL) return; // already fresh
  revalidate(url).catch(() => {}); // ignore errors
}
