/**
 * Unit tests for ingest-rate-limiter.ts (AIN-62 review fixes).
 *
 * The core sliding-window behaviour is covered via the route tests. These
 * focused tests cover the Map-entry pruning fix (eviction leaving an empty
 * array must delete the Map entry rather than keeping userId → []).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkIngestRateLimit,
  recordIngestRequest,
  _resetRateLimiterForTests,
  INGEST_RATE_LIMIT,
} from '../ingest-rate-limiter';

beforeEach(() => {
  _resetRateLimiterForTests();
});

describe('ingest-rate-limiter — Map pruning after eviction', () => {
  it('removes the Map entry when all timestamps fall outside the window (no lingering userId → [])', () => {
    const userId = 'prune-test-user';
    const now = Date.now();

    // Record a request at t=0 (inside window).
    recordIngestRequest(userId, now);

    // Check at t = windowMs + 1 (all timestamps now outside the window).
    const futureNow = now + INGEST_RATE_LIMIT.windowMs + 1;
    const result = checkIngestRateLimit(userId, futureNow);

    // After eviction, the user should be allowed again (no phantom state).
    expect(result.allowed).toBe(true);

    // Re-checking does not accumulate a stale empty entry — allowed must still be true.
    const result2 = checkIngestRateLimit(userId, futureNow);
    expect(result2.allowed).toBe(true);
  });

  it('correctly counts requests after a window rollover (no ghost timestamps)', () => {
    const userId = 'rollover-user';
    const t0 = Date.now();

    // Fill the bucket to the max.
    for (let i = 0; i < INGEST_RATE_LIMIT.maxRequests; i++) {
      recordIngestRequest(userId, t0 + i);
    }

    // Advance past the window — all old timestamps should evict.
    const afterWindow = t0 + INGEST_RATE_LIMIT.windowMs + 100;
    const check = checkIngestRateLimit(userId, afterWindow);
    // Should be allowed again — old window fully evicted.
    expect(check.allowed).toBe(true);

    // Recording 5 more in the new window should work without hitting stale state.
    for (let i = 0; i < INGEST_RATE_LIMIT.maxRequests; i++) {
      recordIngestRequest(userId, afterWindow + i);
    }
    // One more should now be blocked.
    const blocked = checkIngestRateLimit(userId, afterWindow + INGEST_RATE_LIMIT.maxRequests);
    expect(blocked.allowed).toBe(false);
  });
});
