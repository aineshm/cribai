/**
 * Unit tests for crm/first-save-analysis.ts (AIN-15, Track C Phase 1).
 *
 * All external I/O is injected via deps (db, generate, nearby, placesApiKey).
 * No real Supabase, LLM, or Google Places calls are made. The red-flag LLM call
 * goes through the `deps.generate` seam (Vercel AI SDK `generateObject` wrapper);
 * tests inject a fake `generate` that resolves the parsed object or rejects
 * (mirroring `generateObject` throwing NoObjectGeneratedError).
 *
 * Test list (spec §TDD test list):
 *  1. all branches ok — all 4 fields status:'ok'
 *  2. trueCost amenity flags fed correctly — laundry/parking cost 0
 *  3a. per-branch isolation: generate throws → redFlags:'error', others ok
 *  3b. per-branch isolation: nearby throws → placesSnapshot:'error', others ok
 *  3c. per-branch isolation: no coordinates → placesSnapshot:'skipped', others ok
 *  3d. per-branch isolation: null rent → trueCost:'skipped', others ok
 *  4. no Places key → placesSnapshot:'skipped'
 *  5. redFlags skipped when description AND amenities both empty
 *  6. redFlags generate rejects (schema/parse fail) → redFlags:'error'
 *  7. branch soft timeout: nearby never resolves + fake timers → placesSnapshot:'error' (timeout)
 *  8. listing not found → rejects with 'Listing not found'
 *  9. never throws on partial failure — full struct resolves even with bad branches
 * 10. default seam: missing provider key → redFlags:'error', others ok (lazy construction)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { firstSaveAnalysis } from '../first-save-analysis';
import type { FirstSaveAnalysisDeps, CrmGenerateObject } from '../types';
import { cannedRedFlagResponse } from '../__fixtures__/gemini-responses';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-test-fsa-1';
const LISTING_ID = 'listing-fsa-1';

// A valid WKB hex for POINT(-89.4012 43.0731) with SRID=4326 (little-endian).
// Layout: byte order (01) + type with SRID flag (0x20000001 LE) + SRID (4326 LE)
//         + longitude float64 LE + latitude float64 LE
// Generated via: buf.writeUInt32LE(0x20000001,1); buf.writeUInt32LE(4326,5);
//                buf.writeDoubleLE(-89.4012,9); buf.writeDoubleLE(43.0731,17)
const VALID_WKB_HEX = '0101000020E6100000EFC9C342AD5956C036AB3E575B894540';

// Fixture row data (raw DB columns)
interface FixtureRow {
  rent: number | null;
  amenities: string[] | null;
  description: string | null;
  title: string | null;
  address: string | null;
  coordinates: string | null;
}

const BASE_ROW: FixtureRow = {
  rent: 1400,
  amenities: ['In-Unit Laundry', 'Off-Street Parking'],
  description: 'Spacious apartment with parking. Landlord requires full year rent upfront.',
  title: '2BR/1BA Near Campus',
  address: '123 Main St, Madison, WI 53706',
  coordinates: VALID_WKB_HEX,
};

// Fixture nearby places result
const FIXTURE_NEARBY_PLACES = [
  { displayName: { text: 'Whole Foods' }, types: ['grocery_or_supermarket'] },
  { displayName: { text: 'Planet Fitness' }, types: ['gym'] },
  { displayName: { text: 'Starbucks' }, types: ['cafe'] },
] as const;

// ---------------------------------------------------------------------------
// Builder stub helpers
// ---------------------------------------------------------------------------

/**
 * Build a maybeSingle-style db stub.
 * The chain: from('crm_listings').select(...).eq(...).eq(...).maybeSingle()
 * resolves with { data: row | null, error: null }.
 */
function makeDb(row: FixtureRow | null): SupabaseClient {
  const payload = { data: row, error: null };
  const maybeSingle = vi.fn().mockResolvedValue(payload);
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle,
  };
  const from = vi.fn().mockReturnValue(builder);
  return { from } as unknown as SupabaseClient;
}

/**
 * Build a maybeSingle-style db stub that returns a DB error on the listing query.
 * data is null, error is the provided error object.
 * Used for FIX 2 regression test: DB error must NOT be masked as "Listing not found".
 */
function makeDbWithError(dbError: { message: string; code?: string }): SupabaseClient {
  const payload = { data: null, error: dbError };
  const maybeSingle = vi.fn().mockResolvedValue(payload);
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle,
  };
  const from = vi.fn().mockReturnValue(builder);
  return { from } as unknown as SupabaseClient;
}

/**
 * Build a `generate` seam mock that resolves with the parsed object derived from
 * a canned JSON string (mirroring `generateObject` returning the validated
 * red-flag object).
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

/**
 * Build a full deps object with overrides.
 * Pass `placesApiKey: undefined` explicitly to omit the key (no Places API key scenario).
 */
function makeDeps(
  overrides: Partial<FirstSaveAnalysisDeps> & {
    row?: FixtureRow | null;
    generateText?: string;
    generateThrows?: boolean;
    placesApiKey?: string | undefined;
  } = {},
): FirstSaveAnalysisDeps {
  const {
    row = BASE_ROW,
    generateText = cannedRedFlagResponse,
    generateThrows = false,
    ...rest
  } = overrides;

  const db = rest.db ?? makeDb(row);
  const generate = rest.generate
    ? rest.generate
    : generateThrows
      ? makeGenerateThrowing()
      : makeGenerate(generateText);
  const nearby = rest.nearby ?? vi.fn().mockResolvedValue(FIXTURE_NEARBY_PLACES);

  // Use 'placesApiKey' in overrides to detect whether the caller explicitly set it
  // (even to undefined), vs omitting it (in which case we default to 'fake-api-key').
  const hasExplicitPlacesApiKey = 'placesApiKey' in overrides;
  const placesApiKey = hasExplicitPlacesApiKey ? overrides.placesApiKey : 'fake-api-key';

  return {
    db,
    userId: USER_ID,
    generate,
    nearby,
    ...(placesApiKey !== undefined ? { placesApiKey } : {}),
    perBranchTimeoutMs: rest.perBranchTimeoutMs,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('firstSaveAnalysis', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Test 1: all branches ok
  // -------------------------------------------------------------------------
  it('returns status:ok for all 4 branches when row is complete', async () => {
    const deps = makeDeps();
    const result = await firstSaveAnalysis(LISTING_ID, deps);

    expect(result.listingId).toBe(LISTING_ID);

    // trueCost
    expect(result.trueCost.status).toBe('ok');
    if (result.trueCost.status === 'ok') {
      expect(typeof result.trueCost.data.total).toBe('number');
      expect(result.trueCost.data.total).toBeGreaterThan(0);
      expect(result.trueCost.data.rent).toBe(1400);
    }

    // redFlags
    expect(result.redFlags.status).toBe('ok');
    if (result.redFlags.status === 'ok') {
      expect(Array.isArray(result.redFlags.data.flags)).toBe(true);
      expect(result.redFlags.data.flags.length).toBeGreaterThan(0);
      expect(typeof result.redFlags.data.summary).toBe('string');
    }

    // placesSnapshot
    expect(result.placesSnapshot.status).toBe('ok');
    if (result.placesSnapshot.status === 'ok') {
      expect(typeof result.placesSnapshot.data.categories).toBe('object');
      // Should have categorized the fixture places
      const cats = result.placesSnapshot.data.categories;
      expect(Object.keys(cats).length).toBeGreaterThan(0);
    }

    // steeringQuestion
    expect(result.steeringQuestion.status).toBe('ok');
    if (result.steeringQuestion.status === 'ok') {
      expect(result.steeringQuestion.data.question.length).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // Test 2: trueCost amenity flags fed correctly
  // -------------------------------------------------------------------------
  it('trueCost applies amenity flags: in-unit laundry + parking cost 0', async () => {
    const deps = makeDeps({
      row: {
        ...BASE_ROW,
        rent: 1200,
        amenities: ['in-unit laundry', 'parking'],
      },
    });
    const result = await firstSaveAnalysis(LISTING_ID, deps);

    expect(result.trueCost.status).toBe('ok');
    if (result.trueCost.status === 'ok') {
      // laundry and parking should both be 0 because the amenities include them
      expect(result.trueCost.data.laundry).toBe(0);
      expect(result.trueCost.data.parking).toBe(0);
      expect(result.trueCost.data.rent).toBe(1200);
    }
  });

  // -------------------------------------------------------------------------
  // Test 3a: generate throws → redFlags:'error', others ok
  // -------------------------------------------------------------------------
  it('redFlags:error when the LLM call throws; other branches remain ok', async () => {
    const deps = makeDeps({ generateThrows: true });
    const result = await firstSaveAnalysis(LISTING_ID, deps);

    expect(result.redFlags.status).toBe('error');
    expect(result.trueCost.status).toBe('ok');
    expect(result.placesSnapshot.status).toBe('ok');
    expect(result.steeringQuestion.status).toBe('ok');
  });

  // -------------------------------------------------------------------------
  // Test 3b: nearby throws → placesSnapshot:'error', others ok
  // -------------------------------------------------------------------------
  it('placesSnapshot:error when nearby throws; other branches remain ok', async () => {
    const deps = makeDeps({
      nearby: vi.fn().mockRejectedValue(new Error('Places API down')),
    });
    const result = await firstSaveAnalysis(LISTING_ID, deps);

    expect(result.placesSnapshot.status).toBe('error');
    expect(result.trueCost.status).toBe('ok');
    expect(result.redFlags.status).toBe('ok');
    expect(result.steeringQuestion.status).toBe('ok');
  });

  // -------------------------------------------------------------------------
  // Test 3c: no coordinates → placesSnapshot:'skipped', others ok
  // -------------------------------------------------------------------------
  it('placesSnapshot:skipped (no coordinates) when row has null coordinates; others ok', async () => {
    const deps = makeDeps({
      row: { ...BASE_ROW, coordinates: null },
    });
    const result = await firstSaveAnalysis(LISTING_ID, deps);

    expect(result.placesSnapshot.status).toBe('skipped');
    if (result.placesSnapshot.status === 'skipped') {
      expect(result.placesSnapshot.reason).toMatch(/coordinates/i);
    }
    expect(result.trueCost.status).toBe('ok');
    expect(result.redFlags.status).toBe('ok');
    expect(result.steeringQuestion.status).toBe('ok');
  });

  // -------------------------------------------------------------------------
  // Test 3d: null rent → trueCost:'skipped', others ok
  // -------------------------------------------------------------------------
  it('trueCost:skipped when row has null rent; other branches remain ok', async () => {
    const deps = makeDeps({
      row: { ...BASE_ROW, rent: null },
    });
    const result = await firstSaveAnalysis(LISTING_ID, deps);

    expect(result.trueCost.status).toBe('skipped');
    if (result.trueCost.status === 'skipped') {
      expect(result.trueCost.reason).toMatch(/rent/i);
    }
    expect(result.redFlags.status).toBe('ok');
    expect(result.placesSnapshot.status).toBe('ok');
    expect(result.steeringQuestion.status).toBe('ok');
  });

  // -------------------------------------------------------------------------
  // Test 4: no Places key → placesSnapshot:'skipped'
  // -------------------------------------------------------------------------
  it('placesSnapshot:skipped when no placesApiKey provided', async () => {
    const deps = makeDeps({ placesApiKey: undefined });
    const result = await firstSaveAnalysis(LISTING_ID, deps);

    expect(result.placesSnapshot.status).toBe('skipped');
    if (result.placesSnapshot.status === 'skipped') {
      expect(result.placesSnapshot.reason).toMatch(/api key/i);
    }
  });

  // -------------------------------------------------------------------------
  // Test 5: redFlags skipped when description AND amenities both empty
  // -------------------------------------------------------------------------
  it('redFlags:skipped when description and amenities are both absent', async () => {
    const deps = makeDeps({
      row: { ...BASE_ROW, description: null, amenities: null },
    });
    const result = await firstSaveAnalysis(LISTING_ID, deps);

    expect(result.redFlags.status).toBe('skipped');
    if (result.redFlags.status === 'skipped') {
      expect(result.redFlags.reason).toMatch(/scan/i);
    }
  });

  // -------------------------------------------------------------------------
  // Test 6: redFlags generate rejects (schema/parse fail) → redFlags:'error'
  //   Models `generateObject` throwing NoObjectGeneratedError when the model
  //   output can't be parsed/validated against RedFlagSchema.
  // -------------------------------------------------------------------------
  it('redFlags:error when the LLM call rejects (response did not match schema)', async () => {
    const deps = makeDeps({
      generate: makeGenerateThrowing('No object generated: response did not match schema.'),
    });
    const result = await firstSaveAnalysis(LISTING_ID, deps);

    expect(result.redFlags.status).toBe('error');
  });

  // -------------------------------------------------------------------------
  // Test 7: branch soft timeout
  // -------------------------------------------------------------------------
  it('placesSnapshot:error (timeout) when nearby never resolves and timers advance past perBranchTimeoutMs', async () => {
    vi.useFakeTimers();

    const neverResolves = new Promise<never>(() => { /* intentionally never resolves */ });
    const deps = makeDeps({
      nearby: vi.fn().mockReturnValue(neverResolves),
      perBranchTimeoutMs: 1000,
    });

    // Capture promise first — do NOT await before advancing timers
    const analysisPromise = firstSaveAnalysis(LISTING_ID, deps);

    // Advance past the branch timeout
    await vi.advanceTimersByTimeAsync(1001);

    const result = await analysisPromise;

    expect(result.placesSnapshot.status).toBe('error');
    if (result.placesSnapshot.status === 'error') {
      expect(result.placesSnapshot.error).toMatch(/timeout/i);
    }
    // Other branches should still resolve (they don't time out)
    expect(result.trueCost.status).toBe('ok');
    expect(result.redFlags.status).toBe('ok');
    expect(result.steeringQuestion.status).toBe('ok');
  });

  // -------------------------------------------------------------------------
  // Test 8: listing not found → rejects with 'Listing not found'
  // -------------------------------------------------------------------------
  it('rejects with "Listing not found" when row is null', async () => {
    const deps = makeDeps({ row: null });
    await expect(firstSaveAnalysis(LISTING_ID, deps)).rejects.toThrow('Listing not found');
  });

  // -------------------------------------------------------------------------
  // FIX 2 regression: DB error must NOT be masked as "Listing not found"
  // -------------------------------------------------------------------------
  it('rejects with a DB-error message (not "Listing not found") when maybeSingle returns an error', async () => {
    const dbError = { message: 'connection lost', code: 'PGRST301' };
    const db = makeDbWithError(dbError);
    const deps = makeDeps({ db });

    await expect(firstSaveAnalysis(LISTING_ID, deps)).rejects.toSatisfy(
      (err: unknown) => {
        if (!(err instanceof Error)) return false;
        // Must reference the listing ID and original error, NOT "Listing not found"
        return (
          err.message.includes('failed to load listing') &&
          err.message.includes(LISTING_ID) &&
          !err.message.includes('Listing not found')
        );
      },
    );
  });

  it('still rejects with "Listing not found" when data is null but error is also null (row absent, no DB error)', async () => {
    // null data + null error → row simply doesn't exist → "Listing not found"
    const deps = makeDeps({ row: null });
    await expect(firstSaveAnalysis(LISTING_ID, deps)).rejects.toThrow('Listing not found');
  });

  // -------------------------------------------------------------------------
  // Test 9: never throws on partial failure — full struct resolves
  // -------------------------------------------------------------------------
  it('resolves to a full FirstSaveAnalysis struct even when multiple branches fail', async () => {
    const deps = makeDeps({
      generateThrows: true,
      nearby: vi.fn().mockRejectedValue(new Error('all broken')),
      row: { ...BASE_ROW, rent: null },  // trueCost skipped too
    });

    // Should resolve (not reject)
    const result = await firstSaveAnalysis(LISTING_ID, deps);

    // Struct shape present
    expect(result).toHaveProperty('listingId');
    expect(result).toHaveProperty('trueCost');
    expect(result).toHaveProperty('redFlags');
    expect(result).toHaveProperty('placesSnapshot');
    expect(result).toHaveProperty('steeringQuestion');

    // Each field has a valid FanoutBranch status
    for (const field of ['trueCost', 'redFlags', 'placesSnapshot', 'steeringQuestion'] as const) {
      expect(['ok', 'skipped', 'error']).toContain(result[field].status);
    }

    // steeringQuestion should still be ok (it's deterministic)
    expect(result.steeringQuestion.status).toBe('ok');
  });

  // -------------------------------------------------------------------------
  // Test 10: default seam — missing provider key → redFlags:'error', others ok.
  //   Exercises the REAL default `defaultCrmGenerate` (no deps.generate). With
  //   AI_PROVIDER=openai (default) and OPENAI_API_KEY unset, createAiSdkModel()
  //   throws INSIDE redFlagsBranch's try — it must degrade to {status:'error'},
  //   never escape the branch, and never take down the overall analysis.
  // -------------------------------------------------------------------------
  it('default seam: missing OPENAI_API_KEY → redFlags:error (lazy construction), others ok', async () => {
    const prevKey = process.env.OPENAI_API_KEY;
    const prevProvider = process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_PROVIDER; // default provider = openai

    try {
      // makeDeps always injects a fake generate; build deps manually so the
      // real default seam is exercised (generate omitted).
      const deps: FirstSaveAnalysisDeps = {
        db: makeDb(BASE_ROW),
        userId: USER_ID,
        nearby: vi.fn().mockResolvedValue(FIXTURE_NEARBY_PLACES),
        placesApiKey: 'fake-api-key',
      };

      const result = await firstSaveAnalysis(LISTING_ID, deps);

      expect(result.redFlags.status).toBe('error');
      // Other branches must remain healthy — the analysis never throws.
      expect(result.trueCost.status).toBe('ok');
      expect(result.placesSnapshot.status).toBe('ok');
      expect(result.steeringQuestion.status).toBe('ok');
    } finally {
      if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey;
      if (prevProvider !== undefined) process.env.AI_PROVIDER = prevProvider;
    }
  });
});
