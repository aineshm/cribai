/**
 * Unit tests for crm/infer-profile.ts (AIN-15, Track C Phase 1).
 *
 * All tests inject fake `readDb` / `writeDb` builder stubs — no real Supabase
 * connection. `gemini` is mocked via vi.fn() returning a canned text response.
 *
 * Builder stub pattern:
 *   - `readDb`: thenable builder (mirrors rank-compare.test.ts pattern) —
 *     the SELECT chain ends with `.eq()` and the whole builder is awaited.
 *   - `writeDb`: has a spy `from` returning a builder with a spy `upsert` so
 *     we can assert it was called with the right args and was NOT called on
 *     certain failure paths.
 *
 * Test list (spec §TDD):
 *   1. < min saves → needs_more_data, NO write, NO gemini
 *   2. ≥ min saves → inferred + upsert (gemini called once, writeDb upsert called once)
 *   3. malformed JSON → needs_more_data, NO write
 *   4. wrong-shape JSON → needs_more_data, NO write
 *   5. weights normalized: weights summing to 2.0 → upserted weights sum ~1.0
 *   6. service-role-not-RLS guard: upsert goes through writeDb, NOT readDb
 *   7. custom minSavesForInference: 1 → proceeds with twoSavedRows
 *   8. gemini throws → needs_more_data, NO write
 */

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { inferProfile } from '../infer-profile';
import { inferenceConfidence } from '../confidence';
import type { InferProfileDeps } from '../types';
import { twoSavedRows, fiveSavedRows } from '../__fixtures__/crm-rows';
import {
  cannedInferredProfileResponse,
  cannedInferredProfileUnnormalizedResponse,
  malformedJsonResponse,
  wrongShapeResponse,
} from '../__fixtures__/gemini-responses';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-test-infer-1';

// ---------------------------------------------------------------------------
// Builder stub helpers
// ---------------------------------------------------------------------------

/**
 * Build a thenable readDb stub. The chain:
 *   from('crm_listings').select(...).eq(...).eq(...)
 * is awaitable because the builder object is thenable. This mirrors the
 * pattern in rank-compare.test.ts.
 */
function makeReadDb(rows: unknown[]): SupabaseClient {
  const payload = { data: rows, error: null };
  const builder = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    // thenable: `await from('crm_listings').select(...).eq(...)` works
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(payload).then(resolve),
    catch: (reject: (e: unknown) => unknown) => Promise.resolve(payload).catch(reject),
    finally: (f: () => void) => Promise.resolve(payload).finally(f),
  };
  const from = vi.fn().mockReturnValue(builder);
  return { from } as unknown as SupabaseClient;
}

/**
 * Build a writeDb stub with spy-able `from` and `upsert` methods.
 * The upsert resolves with { data: null, error: upsertError }.
 */
function makeWriteDb(upsertError: unknown = null): {
  db: SupabaseClient;
  upsertSpy: ReturnType<typeof vi.fn>;
  fromSpy: ReturnType<typeof vi.fn>;
} {
  const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: upsertError });
  const tableBuilder = { upsert: upsertSpy };
  const fromSpy = vi.fn().mockReturnValue(tableBuilder);
  const db = { from: fromSpy } as unknown as SupabaseClient;
  return { db, upsertSpy, fromSpy };
}

/**
 * Build a Gemini mock that resolves with the given text as `result.text`.
 */
function makeGemini(text: string) {
  return {
    models: {
      generateContent: vi.fn().mockResolvedValue({ text }),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('inferProfile', () => {
  // -------------------------------------------------------------------------
  // Test 1: < min saves → needs_more_data, NO write, NO gemini
  // -------------------------------------------------------------------------
  it('returns needs_more_data when saved count < minSavesForInference (default 3)', async () => {
    const readDb = makeReadDb(twoSavedRows);
    const { db: writeDb, upsertSpy, fromSpy: writeFromSpy } = makeWriteDb();
    const gemini = makeGemini(cannedInferredProfileResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      gemini: gemini as never,
    };

    const result = await inferProfile(USER_ID, deps);

    expect(result.status).toBe('needs_more_data');
    if (result.status === 'needs_more_data') {
      expect(result.savedCount).toBe(2);
      expect(typeof result.steeringQuestion).toBe('string');
      expect(result.steeringQuestion.length).toBeGreaterThan(0);
    }

    // Gemini must NOT be called
    expect(gemini.models.generateContent).not.toHaveBeenCalled();

    // writeDb must NOT be touched
    expect(writeFromSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 2: ≥ min saves → inferred + upsert
  // -------------------------------------------------------------------------
  it('infers profile and upserts when savedCount >= minSavesForInference', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb, upsertSpy, fromSpy: writeFromSpy } = makeWriteDb();
    const gemini = makeGemini(cannedInferredProfileResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      gemini: gemini as never,
    };

    const result = await inferProfile(USER_ID, deps);

    expect(result.status).toBe('inferred');
    if (result.status !== 'inferred') return;

    // Gemini called exactly once
    expect(gemini.models.generateContent).toHaveBeenCalledTimes(1);

    // writeDb.from called with the right table
    expect(writeFromSpy).toHaveBeenCalledWith('crm_inferred_profiles');

    // upsert called once with correct row fields
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [upsertedRow, upsertOpts] = upsertSpy.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(upsertedRow.user_id).toBe(USER_ID);
    // Confidence must be the COMPUTED value, NOT the canned fixture's 0.7
    const expectedConfidence = inferenceConfidence(fiveSavedRows.length);
    expect(upsertedRow.confidence).toBeCloseTo(expectedConfidence, 9);
    expect(result.profile.confidence).toBeCloseTo(expectedConfidence, 9);

    // Profile fields from Gemini response
    expect(result.profile.rent_min).toBe(900);
    expect(result.profile.rent_max).toBe(1600);
    expect(result.profile.bedrooms_target).toBe(1);
    expect(result.profile.must_have_amenities).toEqual(['In-Unit Laundry', 'WiFi']);
    expect(result.profile.nice_to_have_amenities).toEqual(['Off-Street Parking', 'Dishwasher']);
    expect(result.profile.home_base_address).toBe('1415 Engineering Dr, Madison, WI 53706');
    expect(result.profile.commute_max_minutes).toBe(15);

    // onConflict option must be set
    expect(upsertOpts).toEqual({ onConflict: 'user_id' });
  });

  // -------------------------------------------------------------------------
  // Test 3: malformed JSON → needs_more_data, NO write
  // -------------------------------------------------------------------------
  it('returns needs_more_data when Gemini returns malformed JSON', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb, upsertSpy } = makeWriteDb();
    const gemini = makeGemini(malformedJsonResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      gemini: gemini as never,
    };

    const result = await inferProfile(USER_ID, deps);

    expect(result.status).toBe('needs_more_data');
    // writeDb must NOT be touched
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 4: wrong-shape JSON (valid JSON, fails schema) → needs_more_data, NO write
  // -------------------------------------------------------------------------
  it('returns needs_more_data when Gemini returns valid JSON with wrong shape', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb, upsertSpy } = makeWriteDb();
    const gemini = makeGemini(wrongShapeResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      gemini: gemini as never,
    };

    const result = await inferProfile(USER_ID, deps);

    expect(result.status).toBe('needs_more_data');
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 5: weights normalized
  // -------------------------------------------------------------------------
  it('normalizes weights so they sum to ~1.0 when Gemini returns weights summing to 2.0', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb, upsertSpy } = makeWriteDb();
    const gemini = makeGemini(cannedInferredProfileUnnormalizedResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      gemini: gemini as never,
    };

    const result = await inferProfile(USER_ID, deps);

    expect(result.status).toBe('inferred');
    if (result.status !== 'inferred') return;

    // Weights must sum to ~1.0
    const weightsSum = Object.values(result.profile.weights).reduce((a, b) => a + b, 0);
    expect(weightsSum).toBeCloseTo(1.0, 9);

    // Upserted row's weights must also be normalized
    const [upsertedRow] = upsertSpy.mock.calls[0] as [Record<string, unknown>];
    const upsertedWeights = upsertedRow.weights as Record<string, number>;
    const upsertedSum = Object.values(upsertedWeights).reduce((a, b) => a + b, 0);
    expect(upsertedSum).toBeCloseTo(1.0, 9);

    // Keys must be preserved
    expect(Object.keys(upsertedWeights)).toEqual(['rent', 'bedrooms', 'location', 'amenities']);
  });

  // -------------------------------------------------------------------------
  // Test 6: service-role-not-RLS guard
  // -------------------------------------------------------------------------
  it('upserts through writeDb and never calls readDb for crm_inferred_profiles', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb, fromSpy: writeFromSpy } = makeWriteDb();
    const gemini = makeGemini(cannedInferredProfileResponse);

    // Spy on readDb.from to confirm it's NEVER called with 'crm_inferred_profiles'
    const readFromSpy = (readDb as unknown as { from: ReturnType<typeof vi.fn> }).from;

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      gemini: gemini as never,
    };

    await inferProfile(USER_ID, deps);

    // readDb must only have been called with 'crm_listings' (the SELECT)
    const readFromCalls = readFromSpy.mock.calls.map((args: unknown[]) => args[0] as string);
    expect(readFromCalls).not.toContain('crm_inferred_profiles');

    // writeDb must have been called with 'crm_inferred_profiles' (the UPSERT)
    const writeFromCalls = writeFromSpy.mock.calls.map((args: unknown[]) => args[0] as string);
    expect(writeFromCalls).toContain('crm_inferred_profiles');
  });

  // -------------------------------------------------------------------------
  // Test 7: custom minSavesForInference
  // -------------------------------------------------------------------------
  it('proceeds to inference when minSavesForInference=1 and savedCount=2', async () => {
    const readDb = makeReadDb(twoSavedRows);
    const { db: writeDb } = makeWriteDb();
    const gemini = makeGemini(cannedInferredProfileResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      gemini: gemini as never,
      minSavesForInference: 1,
    };

    const result = await inferProfile(USER_ID, deps);

    // With min=1 and savedCount=2 we should get an inferred profile
    expect(result.status).toBe('inferred');
    expect(gemini.models.generateContent).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 8: gemini throws → needs_more_data, NO write
  // -------------------------------------------------------------------------
  it('returns needs_more_data when Gemini call throws (network/quota error)', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb, upsertSpy } = makeWriteDb();
    const gemini = {
      models: {
        generateContent: vi.fn().mockRejectedValue(new Error('quota exceeded')),
      },
    };

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      gemini: gemini as never,
    };

    const result = await inferProfile(USER_ID, deps);

    expect(result.status).toBe('needs_more_data');
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
