/**
 * Tests for reanalyze step (AIN-71 step 4.6).
 *
 * AIN-77: placesApiKey is env-only. Tests use vi.stubEnv where they need to
 * verify the key is forwarded; ctx.input.placesApiKey is never set.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import type { StepContext } from '../../types';

function makeUpdateMock() {
  return vi.fn().mockResolvedValue({ error: null });
}

function makeSupabase(updateMock: ReturnType<typeof makeUpdateMock>) {
  return {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: updateMock,
        })),
      })),
    })),
  };
}

function makeCtx(
  stubs: { firstSaveAnalysis?: unknown; supabase?: unknown } = {},
): StepContext {
  const updateMock = makeUpdateMock();
  return {
    missionId: 'mission-1',
    userId: 'user-1',
    campusId: 'uw-madison',
    campusSlug: 'uw-madison',
    input: {
      listingId: 'listing-1',
      sourceUrl: 'https://x01oncampus.com/',
      firstSaveAnalysis: stubs.firstSaveAnalysis,
      // AIN-77: placesApiKey intentionally absent from input
    },
    state: {
      updatedFields: ['rent', 'address'],
      confidenceBefore: 0.3,
      confidenceAfter: 0.6,
      floorPlanCount: 0,
    },
    supabase: (stubs.supabase as StepContext['supabase']) ?? (makeSupabase(updateMock) as unknown as StepContext['supabase']),
  };
}

const OK_ANALYSIS = {
  trueCost: { status: 'ok', data: {} },
  redFlags: { status: 'ok', data: [] },
  placesSnapshot: { status: 'ok', data: {} },
  steeringQuestion: { status: 'ok', data: { question: 'Test?' } },
};

const ERROR_ANALYSIS = {
  ...OK_ANALYSIS,
  redFlags: { status: 'error', data: null },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('reanalyze step', () => {
  it('calls firstSaveAnalysis and persists when all branches ok', async () => {
    const updateMock = makeUpdateMock();
    const supabase = makeSupabase(updateMock);
    const stubAnalysis = vi.fn().mockResolvedValue(OK_ANALYSIS);
    const { reanalyzeStep } = await import('../steps/05-reanalyze');

    const ctx = makeCtx({ firstSaveAnalysis: stubAnalysis, supabase: supabase });

    const result = await reanalyzeStep.run(ctx);

    expect(stubAnalysis).toHaveBeenCalledOnce();
    expect(updateMock).toHaveBeenCalledOnce();
    expect(result.output.analysisStatus).toBe('persisted');
  });

  it('skips persist when any branch errored', async () => {
    const updateMock = makeUpdateMock();
    const supabase = makeSupabase(updateMock);
    const stubAnalysis = vi.fn().mockResolvedValue(ERROR_ANALYSIS);
    const { reanalyzeStep } = await import('../steps/05-reanalyze');

    const ctx = makeCtx({ firstSaveAnalysis: stubAnalysis, supabase: supabase });

    const result = await reanalyzeStep.run(ctx);

    expect(stubAnalysis).toHaveBeenCalledOnce();
    expect(updateMock).not.toHaveBeenCalled();
    expect(result.output.analysisStatus).toBe('skipped_branch_error');
  });

  it('returns analysis_failed when firstSaveAnalysis throws, never rethrows', async () => {
    const stubAnalysis = vi.fn().mockRejectedValue(new Error('provider down'));
    const { reanalyzeStep } = await import('../steps/05-reanalyze');

    const ctx = makeCtx({ firstSaveAnalysis: stubAnalysis });

    const result = await reanalyzeStep.run(ctx);
    expect(result.output.analysisStatus).toBe('failed');
    // Should not throw
  });

  it('reads placesApiKey from env only — ignores placesApiKey in ctx.input (AIN-77)', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'correct-env-key');
    vi.resetModules();
    const stubAnalysis = vi.fn().mockResolvedValue(OK_ANALYSIS);
    const { reanalyzeStep } = await import('../steps/05-reanalyze');

    const ctx = makeCtx({ firstSaveAnalysis: stubAnalysis });
    // Deliberately put a different key in input — it must NOT be forwarded
    (ctx.input as Record<string, unknown>).placesApiKey = 'wrong-input-key';

    await reanalyzeStep.run(ctx);

    // The second argument to analysisFn should contain placesApiKey from env
    expect(stubAnalysis).toHaveBeenCalledOnce();
    const callOptions = (stubAnalysis.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(callOptions.placesApiKey).toBe('correct-env-key');
  });
});
