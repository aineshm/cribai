/**
 * PDR-004 Track A Days 3-4 — explicit prompt-cache key + memo (AIN-8)
 *
 * The system-prompt builder splits the prompt into a byte-identical
 * `cachedPrefix` (persona + tool list + policy) and a per-turn
 * `dynamicSuffix`. The prefix is a strong candidate for Gemini explicit
 * context caching: it's large, invariant within a campus, and re-sent on
 * every turn.
 *
 * This module owns the cache KEY derivation + an in-process memo of which
 * prefixes have an explicit cache. Real `caches.create` wiring against the
 * provider is deferred to a manual smoke (no live network in unit tests),
 * so the resolver here is intentionally pluggable: callers inject a
 * `createCache` function. When explicit caching is disabled (config switch,
 * or a cache outage), the turn loop simply composes the prefix into the
 * system prompt instead — so a cache failure can NEVER take down chat.
 *
 * Key derivation: `sha256(cachedPrefix).slice(0,16)`. Stable for the same
 * prefix; different across campuses (the campus name is embedded in the
 * persona segment of the prefix). The key intentionally ignores the dynamic
 * suffix — only the cacheable prefix is keyed.
 */

import { createHash } from 'node:crypto';

/** Derive a stable 16-hex-char cache key from the cacheable prefix. */
export function deriveCacheKey(cachedPrefix: string): string {
  return createHash('sha256').update(cachedPrefix, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Handle to an explicit context cache. `name` is the provider-side cache
 * resource id referenced via `providerOptions`.
 */
export interface ExplicitCacheHandle {
  readonly key: string;
  readonly name: string;
}

/**
 * Creates (or returns a memoized) explicit cache for a prefix. Returns null
 * when caching is disabled or the create call fails — callers MUST treat null
 * as "no cache, compose the full prompt" so an outage degrades gracefully.
 */
export type ExplicitCacheCreator = (
  prefix: string,
  key: string,
) => Promise<ExplicitCacheHandle | null>;

/**
 * In-process memo of explicit caches keyed by prefix hash. A single-region
 * serverless instance reuses the same cache resource across warm invocations;
 * a cold start re-creates on first miss. Provider-side expiry is handled by
 * recreating on the next miss (the memo is cleared via `forget`).
 */
export class ExplicitCacheMemo {
  private readonly memo = new Map<string, ExplicitCacheHandle>();

  /**
   * Resolve the explicit cache for `cachedPrefix`. Returns null when
   * `enabled` is false or the creator returns/throws null — the caller then
   * falls back to a composed prompt.
   */
  async resolve(
    cachedPrefix: string,
    enabled: boolean,
    create: ExplicitCacheCreator,
  ): Promise<ExplicitCacheHandle | null> {
    if (!enabled) return null;

    const key = deriveCacheKey(cachedPrefix);
    const cached = this.memo.get(key);
    if (cached) return cached;

    try {
      const handle = await create(cachedPrefix, key);
      if (handle) {
        this.memo.set(key, handle);
      }
      return handle;
    } catch (err) {
      // A cache outage must never take down chat (plan step 4). Log and
      // signal "no cache" so the turn loop composes the prefix inline.
      console.error('[prompt-cache] explicit cache create failed:', err);
      return null;
    }
  }

  /** Drop a memoized handle (e.g. provider-side expiry / invalidation). */
  forget(cachedPrefix: string): void {
    this.memo.delete(deriveCacheKey(cachedPrefix));
  }

  /** Test-only: number of memoized handles. */
  size(): number {
    return this.memo.size;
  }
}
