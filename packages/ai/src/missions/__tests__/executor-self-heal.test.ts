/**
 * executor-self-heal.test.ts — AIN-80 regression.
 *
 * The in-process run-next path (`POST /api/missions/run-next` → runMissionQueueOnce
 * → executeMission) imports the mission engine via the `@campusnest/ai` barrel.
 * Bundler tree-shaking (the narrow package.json `sideEffects` array) elides the
 * `import './register'` side effects across the barrel re-export chain, so
 * MISSION_REGISTRY is EMPTY in that process and every claimed mission failed with
 * "No mission definition registered for type: …". AIN-77 only fixed/tested the
 * standalone tsx worker, whose import side-effects are never tree-shaken.
 *
 * The robust fix is to make registration independent of import side-effects:
 * executeMission calls ensureMissionsRegistered() before the definition lookup.
 * This test simulates the elided state with clearRegistry() and asserts the
 * executor still resolves the definition (does NOT mark the mission failed).
 *
 * Uses the REAL registry + REAL register module so it exercises the actual
 * registration path; the 5 mission modules are mocked to run their real
 * registerMission side effect without their heavy transitive deps.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Lightweight mission modules: real registerMission, exported *_DEFINITION ──
vi.mock('../housing-search/index', async () => {
  const { registerMission } = await import('../registry');
  const HOUSING_SEARCH_DEFINITION = { type: 'housing_search', steps: [] };
  registerMission(HOUSING_SEARCH_DEFINITION);
  return { HOUSING_SEARCH_STEPS: [], HOUSING_SEARCH_DEFINITION };
});
vi.mock('../tour-outreach-mission', async () => {
  const { registerMission } = await import('../registry');
  const tourOutreachDefinition = { type: 'tour_outreach', steps: [] };
  registerMission(tourOutreachDefinition);
  return { tourOutreachDefinition };
});
vi.mock('../listing-deep-dive/index', async () => {
  const { registerMission } = await import('../registry');
  const LISTING_DEEP_DIVE_DEFINITION = { type: 'listing_deep_dive', steps: [] };
  registerMission(LISTING_DEEP_DIVE_DEFINITION);
  return { LISTING_DEEP_DIVE_STEPS: [], LISTING_DEEP_DIVE_DEFINITION };
});
vi.mock('../sublease-post/index', async () => {
  const { registerMission } = await import('../registry');
  const SUBLEASE_POST_DEFINITION = { type: 'sublease_post', steps: [] };
  registerMission(SUBLEASE_POST_DEFINITION);
  return { SUBLEASE_POST_STEPS: [], SUBLEASE_POST_DEFINITION };
});
vi.mock('../crm-deep-extract/index', async () => {
  const { registerMission } = await import('../registry');
  const CRM_DEEP_EXTRACT_DEFINITION = { type: 'crm_deep_extract', steps: [] };
  registerMission(CRM_DEEP_EXTRACT_DEFINITION);
  return { CRM_DEEP_EXTRACT_STEPS: [], CRM_DEEP_EXTRACT_DEFINITION };
});

vi.mock('@campusnest/supabase/server', () => ({ createSecretClient: () => ({}) }));

vi.mock('../mission-repository', () => ({
  getMission: vi.fn(async () => ({
    id: 'm1',
    type: 'crm_deep_extract',
    status: 'queued',
    current_step_index: 0,
    input: {},
    state: {},
    step_attempts: {},
    campus_id: null,
  })),
  clearMissionLease: vi.fn(),
  completeMission: vi.fn(),
  heartbeatMissionLease: vi.fn(),
  updateMissionStatus: vi.fn(),
  updateMissionState: vi.fn(),
  markMissionFailed: vi.fn(),
  setMissionResult: vi.fn(),
  insertMissionLog: vi.fn(),
  insertMissionDraft: vi.fn(),
  getCampusSlug: vi.fn(async () => null),
  getAllUnappliedSteerings: vi.fn(async () => []),
  markMissionRetrying: vi.fn(),
  markMissionWaitingApproval: vi.fn(),
  markSteeringApplied: vi.fn(),
  updateMissionInput: vi.fn(),
}));

vi.mock('../steering-parser', () => ({ parseSteeringIntent: vi.fn() }));

import { executeMission } from '../executor';
import { clearRegistry, getRegisteredTypes } from '../registry';
import { markMissionFailed, completeMission } from '../mission-repository';

const mockMarkFailed = vi.mocked(markMissionFailed);
const mockComplete = vi.mocked(completeMission);

describe('executor self-heals mission registration (AIN-80)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the mission definition even when the registry is empty at call time', async () => {
    // Simulate the bundler-elided state: registry empty when executeMission runs.
    clearRegistry();
    expect(getRegisteredTypes()).toHaveLength(0);

    await executeMission({ missionId: 'm1', startFromStep: 0 });

    // Must NOT fail with the no-definition error — proves registration self-healed.
    const failedWithNoDef = mockMarkFailed.mock.calls.some(
      (call) => typeof call[2] === 'string' && call[2].includes('No mission definition registered'),
    );
    expect(failedWithNoDef).toBe(false);
    // Registry was repopulated by the executor before the lookup.
    expect(getRegisteredTypes()).toContain('crm_deep_extract');
    // A 0-step mission runs to completion once the definition resolves.
    expect(mockComplete).toHaveBeenCalled();
  });
});
