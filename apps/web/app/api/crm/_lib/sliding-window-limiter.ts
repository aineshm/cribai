/**
 * Generic sliding-window rate limiter factory (AIN-72).
 *
 * Extracted from ingest-rate-limiter.ts so the saved-check route can create
 * its own independent limiter instance with different parameters, without
 * touching the ingest limiter's exported API or its tests.
 *
 * Each `createSlidingWindowLimiter` call creates an isolated Map — limiters
 * never share state.
 *
 * MULTI-INSTANCE CAVEAT (same as ingest limiter):
 * Vercel may run several concurrent instances. A determined caller could
 * exceed the per-user quota by hitting multiple cold-start instances. This
 * is an accepted risk at current scale. AIN-69 covers the durable DB-backed
 * upgrade.
 */

export interface SlidingWindowConfig {
  readonly maxRequests: number;
  readonly windowMs: number;
}

export interface SlidingWindowLimiter {
  check(
    key: string,
    now?: number,
  ): { allowed: true } | { allowed: false; retryAfterMs: number };
  record(key: string, now?: number): void;
  /** Test helper — never call in production. */
  _resetForTests(): void;
}

/**
 * Create a new sliding-window rate limiter with the given config.
 * The returned limiter is independently scoped — it shares no state with
 * other limiter instances.
 */
export function createSlidingWindowLimiter(
  config: SlidingWindowConfig,
): SlidingWindowLimiter {
  const timestamps = new Map<string, number[]>();

  function evict(ts: number[], now: number): void {
    const cutoff = now - config.windowMs;
    let i = 0;
    while (i < ts.length && (ts[i] ?? 0) <= cutoff) {
      i++;
    }
    if (i > 0) ts.splice(0, i);
  }

  function pruneIfEmpty(key: string, ts: number[]): void {
    if (ts.length === 0) timestamps.delete(key);
  }

  return {
    check(key, now = Date.now()) {
      const ts = timestamps.get(key) ?? [];
      evict(ts, now);
      pruneIfEmpty(key, ts);

      if (ts.length < config.maxRequests) {
        return { allowed: true };
      }

      timestamps.set(key, ts);
      const oldest = ts[0] ?? now;
      const retryAfterMs = oldest + config.windowMs - now;
      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
    },

    record(key, now = Date.now()) {
      const ts = timestamps.get(key) ?? [];
      evict(ts, now);
      ts.push(now);
      timestamps.set(key, ts);
    },

    _resetForTests() {
      timestamps.clear();
    },
  };
}
