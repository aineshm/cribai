/**
 * worker.langfuse.test.ts — Regression guard for Langfuse lifecycle in the
 * standalone GH Actions mission worker.
 *
 * The worker process is isolated from the Next.js request lifecycle. The chat
 * route calls initLangfuse() per-request; without an equivalent call in
 * runMissionQueueOnce, mission LLM steps (synthesize, reanalyze) emit no OTel
 * spans and all mission traces are silently absent from Langfuse.
 *
 * flushLangfuse() must run in a `finally` block so buffered spans are flushed
 * even when claimNextMission or executeMission throws — GH Actions worker
 * processes may exit immediately after runMissionQueueOnce resolves/rejects.
 *
 * Tests:
 *   1. Empty queue → initLangfuse called once, flushLangfuse called once.
 *   2. claimNextMission throws → runMissionQueueOnce rejects, flushLangfuse
 *      still called (the finally guarantee).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist mock factories so they are available inside vi.mock() factories ─────
const { mockInitLangfuse, mockFlushLangfuse, mockIsLangfuseConfigured, mockClaimNextMission } =
  vi.hoisted(() => ({
    mockInitLangfuse: vi.fn().mockReturnValue(null),
    mockFlushLangfuse: vi.fn().mockResolvedValue(undefined),
    mockIsLangfuseConfigured: vi.fn().mockReturnValue(false),
    mockClaimNextMission: vi.fn().mockResolvedValue(null),
  }));

// ── Mock the 5 mission modules (register.ts imports these for side effects) ───
vi.mock('../housing-search/index', async () => {
  const { registerMission } = await import('../registry');
  registerMission({ type: 'housing_search', steps: [] });
  return { HOUSING_SEARCH_STEPS: [], HOUSING_SEARCH_DEFINITION: { type: 'housing_search', steps: [] } };
});

vi.mock('../tour-outreach-mission', async () => {
  const { registerMission } = await import('../registry');
  registerMission({ type: 'tour_outreach', steps: [] });
  return { tourOutreachDefinition: { type: 'tour_outreach', steps: [] } };
});

vi.mock('../listing-deep-dive/index', async () => {
  const { registerMission } = await import('../registry');
  registerMission({ type: 'listing_deep_dive', steps: [] });
  return { LISTING_DEEP_DIVE_STEPS: [], LISTING_DEEP_DIVE_DEFINITION: { type: 'listing_deep_dive', steps: [] } };
});

vi.mock('../sublease-post/index', async () => {
  const { registerMission } = await import('../registry');
  registerMission({ type: 'sublease_post', steps: [] });
  return { SUBLEASE_POST_STEPS: [], SUBLEASE_POST_DEFINITION: { type: 'sublease_post', steps: [] } };
});

vi.mock('../crm-deep-extract/index', async () => {
  const { registerMission } = await import('../registry');
  registerMission({ type: 'crm_deep_extract', steps: [] });
  return {
    CRM_DEEP_EXTRACT_STEPS: [],
    CRM_DEEP_EXTRACT_DEFINITION: { type: 'crm_deep_extract', steps: [] },
    CrmDeepExtractInput: undefined,
  };
});

// ── Mock the observability module with controllable spies ─────────────────────
// Path is relative to this test file (src/missions/__tests__/), so we need two
// levels up to reach src/runtime/observability.
vi.mock('../../runtime/observability', () => ({
  initLangfuse: mockInitLangfuse,
  flushLangfuse: mockFlushLangfuse,
  isLangfuseConfigured: mockIsLangfuseConfigured,
}));

// ── Stub worker.ts runtime deps so the module loads without network/DB ────────
vi.mock('@campusnest/supabase/server', () => ({
  createSecretClient: vi.fn().mockReturnValue({}),
}));
vi.mock('../mission-repository', () => ({ claimNextMission: mockClaimNextMission }));
vi.mock('../executor', () => ({ executeMission: vi.fn() }));

// ── Import the module under test AFTER mocks are declared ────────────────────
import { runMissionQueueOnce } from '../worker';

describe('worker Langfuse lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to safe defaults after clearAllMocks wipes mockReturnValues.
    mockFlushLangfuse.mockResolvedValue(undefined);
    mockClaimNextMission.mockResolvedValue(null);
    mockInitLangfuse.mockReturnValue(null);
  });

  it('calls initLangfuse once and flushLangfuse once when the queue is empty', async () => {
    const result = await runMissionQueueOnce({ maxJobs: 1 });

    expect(result.processed).toBe(0);
    expect(mockInitLangfuse).toHaveBeenCalledTimes(1);
    expect(mockFlushLangfuse).toHaveBeenCalledTimes(1);
  });

  it('still calls flushLangfuse even when claimNextMission throws (finally guarantee)', async () => {
    mockClaimNextMission.mockRejectedValue(new Error('DB connection error'));

    await expect(runMissionQueueOnce({ maxJobs: 1 })).rejects.toThrow('DB connection error');

    // flushLangfuse MUST run regardless — buffered spans must not be lost when
    // the worker process is about to exit after an unexpected rejection.
    expect(mockFlushLangfuse).toHaveBeenCalledTimes(1);
  });
});
