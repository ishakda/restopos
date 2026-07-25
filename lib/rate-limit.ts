/**
 * In-memory sliding-window rate limiter.
 * Suitable for the single-node deployment this app targets; swap for a
 * Redis-backed limiter when scaling horizontally (see docs/DEPLOYMENT.md).
 */

const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

function sweep(windowMs: number) {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    const alive = hits.filter((t) => now - t < windowMs);
    if (alive.length === 0) buckets.delete(key);
    else buckets.set(key, alive);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  sweep(windowMs);
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const oldest = Math.min(...hits);
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, oldest + windowMs - now) };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true, remaining: limit - hits.length, retryAfterMs: 0 };
}

/** Test hook. */
export function _resetRateLimiter() {
  buckets.clear();
}
