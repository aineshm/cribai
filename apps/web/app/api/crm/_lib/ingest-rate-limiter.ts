/**
 * Per-user sliding-window rate limiter for the CRM ingest route (AIN-62).
 *
 * WHY in-process (Map-based) rather than DB-backed:
 *   The ingest route's primary threat model is a single user or bot flooding
 *   one Vercel instance with back-to-back requests. An in-process limiter
 *   blocks that class of attack at zero extra DB RTTs, keeping the route fast
 *   for legitimate users.
 *
 *   Trade-off accepted: Vercel may run several concurrent instances, so a
 *   determined attacker hitting multiple cold-start instances could exceed the
 *   per-user quota. That is an acceptable risk at current scale (low traffic,
 *   no monetised LLM path yet). The DB-backed approach can replace this later
 *   without changing the route interface.
 *
 * RATE LIMIT CHOICE — 5 ingest saves per 60 minutes per user:
 *   - The chat route allows 10 LLM turns/hr (free tier). Ingest costs MORE per
 *     request: extraction can hit the LLM rare path AND firstSaveAnalysis runs
 *     four LLM/API branches in parallel. A tighter limit (50 % of chat) is
 *     therefore appropriate.
 *   - Real usage: saving 5 listings per hour is generous for manual browsing.
 *     The extension captures one page at a time; any pattern exceeding that
 *     is programmatic abuse.
 *   - The per-user 200-row save cap is a separate long-term guard that remains
 *     unchanged (enforced in the route handler).
 *
 * INTERFACE CONTRACT: the exported function is side-effect-only (records the
 * request timestamp) and the exported check is read-only. They are kept
 * separate so the route can check BEFORE doing work and record AFTER auth
 * succeeds, preventing rate-limit counter inflation from unauthenticated hits.
 */

/** Sliding-window configuration (exported so tests can override). */
export const INGEST_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
} as const;

/**
 * Per-user timestamp buckets. Each entry is a sorted array of epoch-ms
 * timestamps within the current window. Old entries are evicted lazily on
 * every check/record call.
 */
const userTimestamps = new Map<string, number[]>();

/** Remove timestamps outside the current sliding window (mutates the array). */
function evict(timestamps: number[], now: number): void {
  const cutoff = now - INGEST_RATE_LIMIT.windowMs;
  let i = 0;
  while (i < timestamps.length && (timestamps[i] ?? 0) <= cutoff) {
    i++;
  }
  if (i > 0) {
    timestamps.splice(0, i);
  }
}

/**
 * Remove the Map entry when eviction leaves the array empty. Prevents the Map
 * from growing unboundedly with inactive users across a long-running instance.
 */
function pruneIfEmpty(userId: string, timestamps: number[]): void {
  if (timestamps.length === 0) {
    userTimestamps.delete(userId);
  }
}

/**
 * Check whether the user is within their rate-limit budget.
 * Does NOT record the current request — call `recordIngestRequest` on success.
 *
 * Returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`.
 */
export function checkIngestRateLimit(
  userId: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const timestamps = userTimestamps.get(userId) ?? [];
  evict(timestamps, now);

  // If eviction drained the array, remove the Map entry to prevent unbounded growth.
  pruneIfEmpty(userId, timestamps);

  if (timestamps.length < INGEST_RATE_LIMIT.maxRequests) {
    return { allowed: true };
  }

  // The pruneIfEmpty call above only runs when length === 0 so we only reach
  // here when length >= maxRequests — set the entry so it survives the check.
  userTimestamps.set(userId, timestamps);

  // Oldest timestamp in window + windowMs = when the next slot opens.
  const oldest = timestamps[0] ?? now;
  const retryAfterMs = oldest + INGEST_RATE_LIMIT.windowMs - now;
  return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
}

/**
 * Record one ingest request for the user (call after auth + rate-limit check
 * pass, before doing extraction work).
 */
export function recordIngestRequest(userId: string, now = Date.now()): void {
  const timestamps = userTimestamps.get(userId) ?? [];
  evict(timestamps, now);
  timestamps.push(now);
  // Always set after push — entry is non-empty so no prune needed here.
  userTimestamps.set(userId, timestamps);
}

/**
 * Clear all rate-limit state (test helper — never call in production).
 * Exported only so tests can reset between cases without module reimport.
 */
export function _resetRateLimiterForTests(): void {
  userTimestamps.clear();
}
