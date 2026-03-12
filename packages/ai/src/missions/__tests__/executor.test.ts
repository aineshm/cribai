/**
 * executor.test.ts — Unit tests for the MissionExecutor step pipeline.
 *
 * All Supabase and registry dependencies are mocked so tests run in isolation.
 * Covers: happy-path completion, immutable state accumulation, step failure,
 * HITL draft pausing, resume from step index, early-completion via done=true,
 * campus slug resolution, and guard clauses for non-runnable statuses.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mission } from '@campusnest/types';
import type { MissionStep, StepContext, StepResult } from '../types';

// ── Mock modules before imports ──────────────────────────────
// Vitest requires mocks to be declared before the modules that use them

vi.mock('@campusnest/supabase/server', () => ({
  createSecretClient: () => ({}),
}));

vi.mock('../mission-repository', () => ({
  getMission: vi.fn(),
  updateMissionStatus: vi.fn(),
  updateMissionState: vi.fn(),
  setMissionResult: vi.fn(),
  insertMissionLog: vi.fn(),
  insertMissionDraft: vi.fn(),
  getCampusSlug: vi.fn(),
}));

vi.mock('../registry', () => ({
  getMissionDefinition: vi.fn(),
}));

import { executeMission } from '../executor';
import {
  getMission,
  updateMissionStatus,
  updateMissionState,
  setMissionResult,
  insertMissionLog,
  insertMissionDraft,
  getCampusSlug,
} from '../mission-repository';
import { getMissionDefinition } from '../registry';

// ── Typed mock references ─────────────────────────────────────
// Gives us strongly-typed .mockResolvedValue / .mockReturnValue calls

const mockGetMission = vi.mocked(getMission);
const mockUpdateStatus = vi.mocked(updateMissionStatus);
const mockUpdateState = vi.mocked(updateMissionState);
const mockSetResult = vi.mocked(setMissionResult);
const mockInsertLog = vi.mocked(insertMissionLog);
const mockInsertDraft = vi.mocked(insertMissionDraft);
const mockGetCampusSlug = vi.mocked(getCampusSlug);
const mockGetDefinition = vi.mocked(getMissionDefinition);

/** Returns a minimal valid Mission object with optional field overrides. */
function baseMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    user_id: 'user-1',
    type: 'housing_search',
    title: 'Find apartment',
    status: 'pending',
    goal: 'Find 2BR under $1500',
    listing_id: null,
    idempotency_key: null,
    input: { bedrooms: 2, maxRent: 1500 },
    state: {},
    result: null,
    current_step_index: 0,
    campus_id: 'campus-1',
    expires_at: null,
    created_at: '2026-03-12T00:00:00Z',
    updated_at: '2026-03-12T00:00:00Z',
    ...overrides,
  };
}

/**
 * Creates a MissionStep stub with a given ID.
 * If runFn is provided it replaces the default no-op run implementation.
 * Default output is `{ [id]_done: true }` to make state assertions easy.
 */
function makeStep(id: string, runFn?: (ctx: StepContext) => Promise<StepResult>): MissionStep {
  return {
    id,
    label: `Step ${id}`,
    async run(ctx: StepContext): Promise<StepResult> {
      if (runFn) return runFn(ctx);
      return { output: { [`${id}_done`]: true } };
    },
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('executeMission', () => {
  // Reset all mocks before each test to prevent cross-test contamination
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCampusSlug.mockResolvedValue('uw-madison');
    mockUpdateStatus.mockResolvedValue(undefined);
    mockUpdateState.mockResolvedValue(undefined);
    mockSetResult.mockResolvedValue(undefined);
    mockInsertLog.mockResolvedValue({} as any);
    mockInsertDraft.mockResolvedValue({} as any);
  });

  it('runs all steps and completes the mission', async () => {
    const mission = baseMission();
    mockGetMission.mockResolvedValue(mission);
    mockGetDefinition.mockReturnValue({
      type: 'housing_search',
      steps: [makeStep('search'), makeStep('rank'), makeStep('report')],
    });

    await executeMission({ missionId: 'mission-1' });

    // Status set to running, then completed
    expect(mockUpdateStatus).toHaveBeenCalledWith(expect.anything(), 'mission-1', 'running');
    expect(mockUpdateStatus).toHaveBeenCalledWith(expect.anything(), 'mission-1', 'completed');

    // State persisted after each step
    expect(mockUpdateState).toHaveBeenCalledTimes(3);

    // Result set on completion
    expect(mockSetResult).toHaveBeenCalledWith(
      expect.anything(),
      'mission-1',
      expect.objectContaining({ search_done: true, rank_done: true, report_done: true }),
    );
  });

  it('accumulates state immutably across steps', async () => {
    const stateSnapshots: Record<string, unknown>[] = [];

    const steps = [
      makeStep('step1', async () => ({ output: { a: 1 } })),
      makeStep('step2', async (ctx) => {
        stateSnapshots.push({ ...ctx.state });
        return { output: { b: 2 } };
      }),
      makeStep('step3', async (ctx) => {
        stateSnapshots.push({ ...ctx.state });
        return { output: { c: 3 } };
      }),
    ];

    mockGetMission.mockResolvedValue(baseMission());
    mockGetDefinition.mockReturnValue({ type: 'housing_search', steps });

    await executeMission({ missionId: 'mission-1' });

    // Step 2 should see step 1's output
    expect(stateSnapshots[0]).toEqual({ a: 1 });
    // Step 3 should see step 1 + step 2's output
    expect(stateSnapshots[1]).toEqual({ a: 1, b: 2 });
  });

  it('marks mission as failed when a step throws', async () => {
    const steps = [
      makeStep('good'),
      makeStep('bad', async () => { throw new Error('step exploded'); }),
      makeStep('unreached'),
    ];

    mockGetMission.mockResolvedValue(baseMission());
    mockGetDefinition.mockReturnValue({ type: 'housing_search', steps });

    await executeMission({ missionId: 'mission-1' });

    expect(mockUpdateStatus).toHaveBeenCalledWith(expect.anything(), 'mission-1', 'failed');

    // Error should be logged
    const errorLog = mockInsertLog.mock.calls.find(
      (call) => (call[1] as any).status === 'error',
    );
    expect(errorLog).toBeDefined();
    expect((errorLog![1] as any).detail).toContain('step exploded');

    // Step 3 should not have run (only 2 success + 2 running logs + 1 error log = 5)
    // Actually: step1 running + step1 success + step2 running + step2 error = 4
    expect(mockUpdateState).toHaveBeenCalledTimes(1); // only step 1 succeeded
  });

  it('pauses at waiting_approval when step returns a draft', async () => {
    const steps = [
      makeStep('search'),
      makeStep('present', async () => ({
        output: { shortlist: ['a', 'b'] },
        draft: {
          draftType: 'search_report',
          payload: { listings: ['a', 'b'] },
        },
      })),
      makeStep('unreached'),
    ];

    mockGetMission.mockResolvedValue(baseMission());
    mockGetDefinition.mockReturnValue({ type: 'housing_search', steps });

    await executeMission({ missionId: 'mission-1' });

    expect(mockInsertDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        mission_id: 'mission-1',
        draft_type: 'search_report',
        payload: { listings: ['a', 'b'] },
      }),
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.anything(),
      'mission-1',
      'waiting_approval',
    );

    // Step 3 should not have run
    expect(mockUpdateState).toHaveBeenCalledTimes(2); // step 1 and step 2
  });

  it('resumes from startFromStep, skipping earlier steps', async () => {
    const steps = [
      makeStep('step0'),
      makeStep('step1'),
      makeStep('step2'),
    ];

    mockGetMission.mockResolvedValue(
      baseMission({
        status: 'running',
        current_step_index: 2,
        state: { step0_done: true, step1_done: true },
      }),
    );
    mockGetDefinition.mockReturnValue({ type: 'housing_search', steps });

    await executeMission({ missionId: 'mission-1', startFromStep: 2 });

    // Only step2 should have a running log
    const runningLogs = mockInsertLog.mock.calls.filter(
      (call) => (call[1] as any).status === 'running',
    );
    expect(runningLogs).toHaveLength(1);
    expect((runningLogs[0]![1] as any).action).toBe('step2');
  });

  it('fails immediately if no definition is registered', async () => {
    mockGetMission.mockResolvedValue(baseMission({ type: 'housing_search' }));
    mockGetDefinition.mockReturnValue(undefined);

    await executeMission({ missionId: 'mission-1' });

    expect(mockUpdateStatus).toHaveBeenCalledWith(expect.anything(), 'mission-1', 'failed');
    const errorLog = mockInsertLog.mock.calls.find(
      (call) => (call[1] as any).status === 'error',
    );
    expect(errorLog).toBeDefined();
    expect((errorLog![1] as any).detail).toContain('No mission definition registered');
  });

  it('is a no-op if mission status is completed', async () => {
    mockGetMission.mockResolvedValue(baseMission({ status: 'completed' }));

    await executeMission({ missionId: 'mission-1' });

    expect(mockUpdateStatus).not.toHaveBeenCalled();
    expect(mockInsertLog).not.toHaveBeenCalled();
  });

  it('is a no-op if mission status is failed', async () => {
    mockGetMission.mockResolvedValue(baseMission({ status: 'failed' }));

    await executeMission({ missionId: 'mission-1' });

    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it('handles step with done=true to stop early', async () => {
    const steps = [
      makeStep('only', async () => ({ output: { result: 'done' }, done: true })),
      makeStep('unreached'),
    ];

    mockGetMission.mockResolvedValue(baseMission());
    mockGetDefinition.mockReturnValue({ type: 'housing_search', steps });

    await executeMission({ missionId: 'mission-1' });

    expect(mockUpdateStatus).toHaveBeenCalledWith(expect.anything(), 'mission-1', 'completed');
    // Only 1 step should have been executed
    const runningLogs = mockInsertLog.mock.calls.filter(
      (call) => (call[1] as any).status === 'running',
    );
    expect(runningLogs).toHaveLength(1);
  });

  it('resolves campus slug from campus_id', async () => {
    mockGetMission.mockResolvedValue(baseMission({ campus_id: 'campus-99' }));
    mockGetDefinition.mockReturnValue({
      type: 'housing_search',
      steps: [makeStep('check', async (ctx) => {
        expect(ctx.campusSlug).toBe('uw-madison');
        return { output: {} };
      })],
    });

    await executeMission({ missionId: 'mission-1' });

    expect(mockGetCampusSlug).toHaveBeenCalledWith(expect.anything(), 'campus-99');
  });

  it('uses "unknown" campus slug when campus_id is null', async () => {
    mockGetMission.mockResolvedValue(baseMission({ campus_id: null }));
    mockGetDefinition.mockReturnValue({
      type: 'housing_search',
      steps: [makeStep('check', async (ctx) => {
        expect(ctx.campusSlug).toBe('unknown');
        return { output: {} };
      })],
    });

    await executeMission({ missionId: 'mission-1' });

    expect(mockGetCampusSlug).not.toHaveBeenCalled();
  });
});
