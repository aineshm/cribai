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
 *
 * FACTORY NOTE (AIN-72): the sliding-window mechanics are now provided by
 * createSlidingWindowLimiter in sliding-window-limiter.ts. This module wraps
 * that factory to preserve its existing export API unchanged — ingest route
 * imports and all existing tests continue to work as-is.
 */

import { createSlidingWindowLimiter } from './sliding-window-limiter';

/** Sliding-window configuration (exported so tests can override). */
export const INGEST_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
} as const;

const _ingestLimiter = createSlidingWindowLimiter({
  maxRequests: INGEST_RATE_LIMIT.maxRequests,
  windowMs: INGEST_RATE_LIMIT.windowMs,
});

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
  return _ingestLimiter.check(userId, now);
}

/**
 * Record one ingest request for the user (call after auth + rate-limit check
 * pass, before doing extraction work).
 */
export function recordIngestRequest(userId: string, now = Date.now()): void {
  _ingestLimiter.record(userId, now);
}

/**
 * Clear all rate-limit state (test helper — never call in production).
 * Exported only so tests can reset between cases without module reimport.
 */
export function _resetRateLimiterForTests(): void {
  _ingestLimiter._resetForTests();
}
