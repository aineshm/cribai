/**
 * Unit tests for crm/infer-profile.ts (AIN-15, Track C Phase 1).
 *
 * All tests inject fake `readDb` / `writeDb` builder stubs — no real Supabase
 * connection. The LLM call is mocked via the `deps.generate` seam (a vi.fn()
 * wrapping the Vercel AI SDK `generateObject` contract): the happy path resolves
 * the parsed object; failure paths reject (mirroring `generateObject` throwing
 * NoObjectGeneratedError on parse/validation failure, or the provider throwing).
 *
 * Builder stub pattern:
 *   - `readDb`: thenable builder (mirrors rank-compare.test.ts pattern) —
 *     the SELECT chain ends with `.eq()` and the whole builder is awaited.
 *   - `writeDb`: has a spy `from` returning a builder with a spy `upsert` so
 *     we can assert it was called with the right args and was NOT called on
 *     certain failure paths.
 *
 * Test list (spec §TDD):
 *   1. < min saves → needs_more_data, NO write, NO generate
 *   2. ≥ min saves → inferred + upsert (generate called once, writeDb upsert called once)
 *   3. generate rejects (malformed/invalid output) → needs_more_data, NO write
 *   4. generate rejects (schema validation) → needs_more_data, NO write
 *   5. weights normalized: weights summing to 2.0 → upserted weights sum ~1.0
 *   6. service-role-not-RLS guard: upsert goes through writeDb, NOT readDb
 *   7. custom minSavesForInference: 1 → proceeds with twoSavedRows
 *   8. generate throws → needs_more_data, NO write
 *   9. default seam with no provider key → needs_more_data, NO write (lazy construction)
 */

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { inferProfile } from '../infer-profile';
import { inferenceConfidence } from '../confidence';
import type { InferProfileDeps, CrmGenerateObject } from '../types';
import { twoSavedRows, fiveSavedRows } from '../__fixtures__/crm-rows';
import {
  cannedInferredProfileResponse,
  cannedInferredProfileUnnormalizedResponse,
} from '../__fixtures__/gemini-responses';
import { SCORING_FEATURES } from '../scoring-features';

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
 * Build a thenable readDb stub that returns an error on the listings query.
 * Used for FIX 3 regression: a read-DB error must propagate as a throw,
 * not silently degrade to needs_more_data.
 */
function makeReadDbWithError(dbError: { message: string; code?: string }): SupabaseClient {
  const payload = { data: null, error: dbError };
  const builder = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
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
 * Build a `generate` seam mock that resolves with the parsed object derived
 * from a canned JSON string (mirroring `generateObject` returning `{ object }`,
 * which inferProfile destructures as the validated profile).
 */
function makeGenerate(jsonText: string): CrmGenerateObject {
  return vi.fn(async () => JSON.parse(jsonText)) as unknown as CrmGenerateObject;
}

/**
 * Build a `generate` seam mock that rejects — models the AI SDK throwing
 * (NoObjectGeneratedError on parse/validation failure, or a provider error).
 */
function makeGenerateThrowing(message = 'generation failed'): CrmGenerateObject {
  return vi.fn(async () => {
    throw new Error(message);
  }) as unknown as CrmGenerateObject;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('inferProfile', () => {
  // -------------------------------------------------------------------------
  // Test 1: < min saves → needs_more_data, NO write, NO generate
  // -------------------------------------------------------------------------
  it('returns needs_more_data when saved count < minSavesForInference (default 3)', async () => {
    const readDb = makeReadDb(twoSavedRows);
    const { db: writeDb, upsertSpy, fromSpy: writeFromSpy } = makeWriteDb();
    const generate = makeGenerate(cannedInferredProfileResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
    };

    const result = await inferProfile(USER_ID, deps);

    expect(result.status).toBe('needs_more_data');
    if (result.status === 'needs_more_data') {
      expect(result.savedCount).toBe(2);
      expect(typeof result.steeringQuestion).toBe('string');
      expect(result.steeringQuestion.length).toBeGreaterThan(0);
    }

    // The LLM seam must NOT be called
    expect(generate).not.toHaveBeenCalled();

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
    const generate = makeGenerate(cannedInferredProfileResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
    };

    const result = await inferProfile(USER_ID, deps);

    expect(result.status).toBe('inferred');
    if (result.status !== 'inferred') return;

    // The LLM seam called exactly once, with the right schema/functionId tags.
    expect(generate).toHaveBeenCalledTimes(1);
    const genArg = (generate as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      functionId: string;
      prompt: string;
    };
    expect(genArg.functionId).toBe('crm.infer_profile');

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

    // Profile fields from the model response
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
  // Test 2b: dryRun → inferred profile computed, but upsert SKIPPED
  // -------------------------------------------------------------------------
  it('dryRun: computes the profile but SKIPS the service-role upsert', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb, upsertSpy, fromSpy: writeFromSpy } = makeWriteDb();
    const generate = makeGenerate(cannedInferredProfileResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
      dryRun: true,
    };

    const result = await inferProfile(USER_ID, deps);

    // Read + LLM compute still happen — the profile is the authoritative result.
    expect(result.status).toBe('inferred');
    if (result.status === 'inferred') {
      expect(result.profile.rent_min).toBe(900);
      expect(result.profile.confidence).toBeCloseTo(
        inferenceConfidence(fiveSavedRows.length),
        9,
      );
    }
    expect(generate).toHaveBeenCalledTimes(1);

    // The ONLY side effect — the upsert — must NOT fire.
    expect(writeFromSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 2c: dryRun absent → upsert still fires (regression guard)
  // -------------------------------------------------------------------------
  it('prod path still upserts when dryRun is absent (regression guard)', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb, upsertSpy } = makeWriteDb();
    const generate = makeGenerate(cannedInferredProfileResponse);

    const result = await inferProfile(USER_ID, {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
    });

    expect(result.status).toBe('inferred');
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 3: generate rejects (malformed/unparseable output) → needs_more_data, NO write
  //   Models `generateObject` throwing NoObjectGeneratedError on an
  //   unparseable response.
  // -------------------------------------------------------------------------
  it('returns needs_more_data when generate rejects (unparseable model output)', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb, upsertSpy } = makeWriteDb();
    const generate = makeGenerateThrowing('No object generated: could not parse the response.');

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
    };

    const result = await inferProfile(USER_ID, deps);

    expect(result.status).toBe('needs_more_data');
    // writeDb must NOT be touched
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 4: generate rejects (schema validation) → needs_more_data, NO write
  //   Models `generateObject` throwing NoObjectGeneratedError when the response
  //   did not match the schema.
  // -------------------------------------------------------------------------
  it('returns needs_more_data when generate rejects (response did not match schema)', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb, upsertSpy } = makeWriteDb();
    const generate = makeGenerateThrowing('No object generated: response did not match schema.');

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
    };

    const result = await inferProfile(USER_ID, deps);

    expect(result.status).toBe('needs_more_data');
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 5: weights normalized
  // -------------------------------------------------------------------------
  it('normalizes weights so they sum to ~1.0 when the model returns weights summing to 2.0', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb, upsertSpy } = makeWriteDb();
    const generate = makeGenerate(cannedInferredProfileUnnormalizedResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
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
    const generate = makeGenerate(cannedInferredProfileResponse);

    // Spy on readDb.from to confirm it's NEVER called with 'crm_inferred_profiles'
    const readFromSpy = (readDb as unknown as { from: ReturnType<typeof vi.fn> }).from;

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
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
    const generate = makeGenerate(cannedInferredProfileResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
      minSavesForInference: 1,
    };

    const result = await inferProfile(USER_ID, deps);

    // With min=1 and savedCount=2 we should get an inferred profile
    expect(result.status).toBe('inferred');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 8: generate throws (network/quota) → needs_more_data, NO write
  // -------------------------------------------------------------------------
  it('returns needs_more_data when the LLM call throws (network/quota error)', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb, upsertSpy } = makeWriteDb();
    const generate = makeGenerateThrowing('quota exceeded');

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
    };

    const result = await inferProfile(USER_ID, deps);

    expect(result.status).toBe('needs_more_data');
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 9: default seam with no provider key → needs_more_data, NO write.
  //   Exercises the REAL default `defaultCrmGenerate` (no deps.generate). With
  //   AI_PROVIDER=openai (default) and OPENAI_API_KEY unset, createAiSdkModel()
  //   throws INSIDE the workflow's try — this must degrade, not propagate.
  // -------------------------------------------------------------------------
  it('default seam: missing OPENAI_API_KEY degrades to needs_more_data (lazy construction, no write)', async () => {
    const prevKey = process.env.OPENAI_API_KEY;
    const prevProvider = process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_PROVIDER; // default provider = openai

    try {
      const readDb = makeReadDb(fiveSavedRows);
      const { db: writeDb, upsertSpy, fromSpy: writeFromSpy } = makeWriteDb();

      // NOTE: no `generate` injected → real defaultCrmGenerate path.
      const deps: InferProfileDeps = {
        readDb,
        writeDb,
        userId: USER_ID,
      };

      const result = await inferProfile(USER_ID, deps);

      expect(result.status).toBe('needs_more_data');
      expect(writeFromSpy).not.toHaveBeenCalled();
      expect(upsertSpy).not.toHaveBeenCalled();
    } finally {
      if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey;
      if (prevProvider !== undefined) process.env.AI_PROVIDER = prevProvider;
    }
  });

  // -------------------------------------------------------------------------
  // FIX 1 cross-module regression: prompt must use SCORING_FEATURES keys, not stale aliases
  // -------------------------------------------------------------------------
  it('FIX 1 — the LLM prompt contains all SCORING_FEATURES canonical keys', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb } = makeWriteDb();
    const generate = makeGenerate(cannedInferredProfileResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
    };

    await inferProfile(USER_ID, deps);

    // The prompt passed to the seam must contain each canonical key so the model
    // uses the correct vocabulary (rent, bedrooms, sqft, commute).
    expect(generate).toHaveBeenCalledTimes(1);
    const callArg = (generate as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      prompt: string;
    };
    const promptText = callArg.prompt;

    for (const feature of SCORING_FEATURES) {
      expect(promptText).toContain(feature);
    }
  });

  it('FIX 1 — the LLM prompt does NOT instruct stale/wrong weight keys (price, space)', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    const { db: writeDb } = makeWriteDb();
    const generate = makeGenerate(cannedInferredProfileResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
    };

    await inferProfile(USER_ID, deps);

    const callArg = (generate as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      prompt: string;
    };
    const promptText = callArg.prompt;

    // The prompt must NOT tell the model to use stale key names as weight keys.
    expect(promptText).not.toMatch(/"price"/);
    expect(promptText).not.toMatch(/"space"/);
  });

  // -------------------------------------------------------------------------
  // FIX 3 regression: read-DB error must throw, not silently degrade to needs_more_data
  // -------------------------------------------------------------------------
  it('throws when the readDb query returns an error (does NOT silently degrade to needs_more_data)', async () => {
    const dbError = { message: 'connection lost', code: 'PGRST301' };
    const readDb = makeReadDbWithError(dbError);
    const { db: writeDb, upsertSpy, fromSpy: writeFromSpy } = makeWriteDb();
    const generate = makeGenerate(cannedInferredProfileResponse);

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: USER_ID,
      generate,
    };

    // Must throw — not silently return needs_more_data.
    await expect(inferProfile(USER_ID, deps)).rejects.toThrow('inferProfile: failed to read saved listings');

    // The LLM seam must NOT be called (error short-circuits before LLM)
    expect(generate).not.toHaveBeenCalled();

    // writeDb must NOT be touched
    expect(writeFromSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
