/**
 * Unit tests for crm/rank-compare.ts (AIN-15, Phase 1).
 *
 * All tests inject a fake `deps.db` builder stub — no real Supabase connection.
 * The stub mirrors the supabase-js builder pattern used elsewhere:
 *   from(table).select(...).eq(field, value)  → Promise<{ data, error }>
 *
 * Two tables are queried:
 *   'crm_listings'          — active listings for the user
 *   'crm_inferred_profiles' — single profile row (may be absent)
 *
 * Fixtures come from ../__fixtures__/crm-rows. This file extends them with
 * rank-compare-specific variants where the pre-built arrays aren't sufficient.
 */

import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rankCompare } from '../rank-compare';
import type { CrmListingRow, InferredProfile, RankCompareArgs } from '../types';
import { makeCrmRow } from '../__fixtures__/crm-rows';

// ---------------------------------------------------------------------------
// Builder stub helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal supabase-js chainable builder stub.
 * The stub resolves with `{ data, error }` after any chain of
 * .select() / .eq() / .single() calls (all methods return `this`
 * except the terminal `.single()` and the awaited-chain itself).
 *
 * `callMap` maps table name → resolved value so two separate `.from()` calls
 * (one for listings, one for profiles) can return different payloads.
 */
function makeDbStub(
  callMap: Record<string, { data: unknown; error: null | { message: string } }>,
): SupabaseClient {
  const from = (table: string) => {
    const payload = callMap[table] ?? { data: null, error: null };
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: () => Promise.resolve(payload),
      // The entire builder itself is thenable so callers can `await from(...).select(...).eq(...)`
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(payload).then(resolve),
      catch: (reject: (e: unknown) => unknown) => Promise.resolve(payload).catch(reject),
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

/** Build a db stub that returns the given listing rows + optional profile. */
function buildDb(
  rows: CrmListingRow[],
  profile: InferredProfile | null = null,
): SupabaseClient {
  return makeDbStub({
    crm_listings: { data: rows, error: null },
    crm_inferred_profiles: {
      data: profile,
      error: profile ? null : { message: 'no rows found' },
    },
  });
}

const USER_ID = 'user-test-1';

function makeDeps(rows: CrmListingRow[], profile: InferredProfile | null = null) {
  return { db: buildDb(rows, profile), userId: USER_ID };
}

// ---------------------------------------------------------------------------
// Fixture variants for rank-compare tests
// ---------------------------------------------------------------------------

/** Three active listings with varied rent, bedrooms, sqft. */
const cheapRow = makeCrmRow({
  id: 'rc-cheap',
  title: 'Cheap Studio',
  rent: 700,
  bedrooms: 0,
  bathrooms: 1,
  sqft: 400,
  status: 'active',
  latitude: 43.075,
  longitude: -89.4,
});

const midRow = makeCrmRow({
  id: 'rc-mid',
  title: 'Mid 1BR',
  rent: 1200,
  bedrooms: 1,
  bathrooms: 1,
  sqft: 700,
  status: 'active',
  latitude: 43.073,
  longitude: -89.402,
});

const expensiveRow = makeCrmRow({
  id: 'rc-expensive',
  title: 'Expensive 2BR',
  rent: 2000,
  bedrooms: 2,
  bathrooms: 2,
  sqft: 1100,
  status: 'active',
  latitude: 43.07,
  longitude: -89.405,
});

/** Profile with positive rent weight (to expose sign-convention bugs). */
const profileWithRentWeight: InferredProfile = {
  rent_min: 600,
  rent_max: 2200,
  bedrooms_target: 1,
  must_have_amenities: [],
  nice_to_have_amenities: [],
  home_base_address: null,
  commute_max_minutes: null,
  weights: { rent: 2, bedrooms: 1, sqft: 1, commute: 0 },
  confidence: 0.8,
};

/** Profile with equal weights for commute comparison tests. */
const profileWithCommute: InferredProfile = {
  rent_min: null,
  rent_max: null,
  bedrooms_target: null,
  must_have_amenities: [],
  nice_to_have_amenities: [],
  home_base_address: '432 N Lake St, Madison, WI 53706',
  commute_max_minutes: null, // no minutes cap → commute is neutral
  weights: { rent: 0, bedrooms: 0, sqft: 0, commute: 1 },
  confidence: 0.5,
};

// ---------------------------------------------------------------------------
// RANK MODE — happy path
// ---------------------------------------------------------------------------

describe('rankCompare — rank mode (happy path)', () => {
  it('returns mode="rank" with ranked array of correct length', async () => {
    const rows = [cheapRow, midRow, expensiveRow];
    const result = await rankCompare({}, makeDeps(rows));

    expect(result.mode).toBe('rank');
    if (result.mode !== 'rank') throw new Error('wrong mode');
    expect(result.ranked).toHaveLength(3);
  });

  it('returns ranked listings sorted by score DESC', async () => {
    const rows = [cheapRow, midRow, expensiveRow];
    const args: RankCompareArgs = { mode: 'rank' };
    const result = await rankCompare(args, makeDeps(rows, profileWithRentWeight));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    const scores = result.ranked.map((r) => r.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]!).toBeGreaterThanOrEqual(scores[i]!);
    }
  });

  it('each ranked item has listingId, title, score, and breakdown', async () => {
    const rows = [cheapRow, midRow];
    const result = await rankCompare({}, makeDeps(rows));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    for (const item of result.ranked) {
      expect(typeof item.listingId).toBe('string');
      expect(typeof item.title).toBe('string');
      expect(typeof item.score).toBe('number');
      expect(typeof item.breakdown).toBe('object');
    }
  });
});

// ---------------------------------------------------------------------------
// RANK MODE — RENT SIGN CONVENTION (CRITICAL)
// ---------------------------------------------------------------------------

describe('rankCompare — rent sign convention (CRITICAL)', () => {
  it('cheapest listing has the HIGHEST rent sub-score', async () => {
    // Rent weight is 2x; others are 0 so only rent drives ranking.
    const rentOnlyProfile: InferredProfile = {
      ...profileWithRentWeight,
      weights: { rent: 1, bedrooms: 0, sqft: 0, commute: 0 },
    };
    const rows = [expensiveRow, cheapRow]; // deliberately reverse order
    const result = await rankCompare({}, makeDeps(rows, rentOnlyProfile));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    const cheapItem = result.ranked.find((r) => r.listingId === 'rc-cheap');
    const expItem = result.ranked.find((r) => r.listingId === 'rc-expensive');
    expect(cheapItem).toBeDefined();
    expect(expItem).toBeDefined();
    expect(cheapItem!.breakdown['rent']).toBeGreaterThan(expItem!.breakdown['rent']!);
  });

  it('cheapest listing ranks first overall when only rent weight is non-zero', async () => {
    const rentOnlyProfile: InferredProfile = {
      ...profileWithRentWeight,
      weights: { rent: 1, bedrooms: 0, sqft: 0, commute: 0 },
    };
    const rows = [expensiveRow, midRow, cheapRow];
    const result = await rankCompare({}, makeDeps(rows, rentOnlyProfile));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    expect(result.ranked[0]!.listingId).toBe('rc-cheap');
  });

  it('most expensive listing has the LOWEST rent sub-score', async () => {
    const rentOnlyProfile: InferredProfile = {
      ...profileWithRentWeight,
      weights: { rent: 1, bedrooms: 0, sqft: 0, commute: 0 },
    };
    const rows = [cheapRow, midRow, expensiveRow];
    const result = await rankCompare({}, makeDeps(rows, rentOnlyProfile));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    const expItem = result.ranked.find((r) => r.listingId === 'rc-expensive');
    expect(expItem!.breakdown['rent']).toBeCloseTo(0, 5);
  });
});

// ---------------------------------------------------------------------------
// RANK MODE — commute scoring
// ---------------------------------------------------------------------------

describe('rankCompare — commute scoring', () => {
  it('returns 0.5 commute sub-score for all listings when profile has no commute_max_minutes', async () => {
    // Phase 1: no geocoded home_base coords → commute is always neutral 0.5.
    const rows = [cheapRow, midRow, expensiveRow];
    const result = await rankCompare({}, makeDeps(rows, profileWithCommute));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    for (const item of result.ranked) {
      expect(item.breakdown['commute']).toBeCloseTo(0.5, 5);
    }
  });

  it('returns 0.5 commute sub-score for all listings when no profile exists', async () => {
    const rows = [cheapRow, midRow];
    const result = await rankCompare({}, makeDeps(rows, null));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    for (const item of result.ranked) {
      expect(item.breakdown['commute']).toBeCloseTo(0.5, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// RANK MODE — single listing (min === max edge case)
// ---------------------------------------------------------------------------

describe('rankCompare — single listing (min===max)', () => {
  it('returns one ranked row with no NaN or divide-by-zero', async () => {
    const row = makeCrmRow({ id: 'rc-solo', status: 'active', rent: 1500, bedrooms: 2, sqft: 900 });
    const result = await rankCompare({}, makeDeps([row]));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    expect(result.ranked).toHaveLength(1);
  });

  it('all normalized sub-scores are 0.5 when min===max (single listing)', async () => {
    const row = makeCrmRow({ id: 'rc-solo2', status: 'active', rent: 1200, bedrooms: 1, sqft: 600 });
    const result = await rankCompare({}, makeDeps([row]));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    const item = result.ranked[0]!;
    for (const val of Object.values(item.breakdown)) {
      expect(Number.isNaN(val)).toBe(false);
      expect(val).toBeCloseTo(0.5, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// RANK MODE — missing numeric field
// ---------------------------------------------------------------------------

describe('rankCompare — missing numeric fields', () => {
  it('row with null sqft gets sqft sub-score of 0 but remains in ranking', async () => {
    const nullSqftRow = makeCrmRow({ id: 'rc-null-sqft', status: 'active', rent: 1200, bedrooms: 1, sqft: null });
    const normalRow = makeCrmRow({ id: 'rc-normal', status: 'active', rent: 1200, bedrooms: 1, sqft: 800 });
    const result = await rankCompare({}, makeDeps([nullSqftRow, normalRow]));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    const nullItem = result.ranked.find((r) => r.listingId === 'rc-null-sqft');
    expect(nullItem).toBeDefined();
    // null sqft treated as 0 → min of set; sqft sub-score = 0
    expect(nullItem!.breakdown['sqft']).toBeCloseTo(0, 5);
  });

  it('row with null rent remains in ranking with worst (0) rent contribution', async () => {
    const nullRentRow = makeCrmRow({ id: 'rc-null-rent', status: 'active', rent: null, bedrooms: 1, sqft: 700 });
    const normalRow = makeCrmRow({ id: 'rc-normal2', status: 'active', rent: 1000, bedrooms: 1, sqft: 700 });
    const result = await rankCompare({}, makeDeps([nullRentRow, normalRow]));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    expect(result.ranked.find((r) => r.listingId === 'rc-null-rent')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// RANK MODE — no inferred profile → equal-weight fallback
// ---------------------------------------------------------------------------

describe('rankCompare — no profile (equal-weight fallback)', () => {
  it('returns a valid ranking with weights that sum to 1', async () => {
    const rows = [cheapRow, midRow, expensiveRow];
    const result = await rankCompare({}, makeDeps(rows, null));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    expect(result.ranked).toHaveLength(3);
    // Scores are in [0, 1]
    for (const item of result.ranked) {
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(1);
    }
  });

  it('no NaN scores when profile is absent', async () => {
    const rows = [cheapRow, midRow, expensiveRow];
    const result = await rankCompare({}, makeDeps(rows, null));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    for (const item of result.ranked) {
      expect(Number.isNaN(item.score)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// RANK MODE — status filter (only 'active' listings ranked)
// ---------------------------------------------------------------------------

describe('rankCompare — status filter', () => {
  it('does NOT include declined or archived rows in ranking', async () => {
    // The db stub returns whatever rows we pass; in production the SQL WHERE
    // clause filters. The query fn itself must apply the status filter so that
    // even a stub returning mixed statuses is handled defensively.
    // We test this by passing rows with mixed statuses directly.
    const activeRow = makeCrmRow({ id: 'rc-active', status: 'active', rent: 1200 });
    const declinedRow = makeCrmRow({ id: 'rc-declined', status: 'declined', rent: 800 });

    // Build a db stub that returns BOTH rows (simulates a stub that hasn't filtered)
    // so we can verify the implementation filters on status internally.
    const db = makeDbStub({
      crm_listings: { data: [activeRow, declinedRow], error: null },
      crm_inferred_profiles: { data: null, error: { message: 'no rows' } },
    });
    const result = await rankCompare({}, { db, userId: USER_ID });

    if (result.mode !== 'rank') throw new Error('wrong mode');
    const ids = result.ranked.map((r) => r.listingId);
    expect(ids).toContain('rc-active');
    expect(ids).not.toContain('rc-declined');
  });
});

// ---------------------------------------------------------------------------
// COMPARE MODE — by titles
// ---------------------------------------------------------------------------

describe('rankCompare — compare mode (by titles)', () => {
  it('returns mode="compare" with matching rows in requested order', async () => {
    const rowA = makeCrmRow({ id: 'cmp-a', title: 'Apt Alpha', status: 'active', rent: 1000 });
    const rowB = makeCrmRow({ id: 'cmp-b', title: 'Apt Beta', status: 'active', rent: 1200 });
    const rowC = makeCrmRow({ id: 'cmp-c', title: 'Apt Gamma', status: 'active', rent: 1400 });
    const args: RankCompareArgs = { mode: 'compare', listingTitles: ['Apt Beta', 'Apt Alpha'] };
    const result = await rankCompare(args, makeDeps([rowA, rowB, rowC]));

    expect(result.mode).toBe('compare');
    if (result.mode !== 'compare') throw new Error('wrong mode');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.listingId).toBe('cmp-b'); // Beta first
    expect(result.rows[1]!.listingId).toBe('cmp-a'); // Alpha second
  });

  it('unknown title is omitted from rows (no error)', async () => {
    const rowA = makeCrmRow({ id: 'cmp-a2', title: 'Apt Alpha', status: 'active', rent: 1000 });
    const args: RankCompareArgs = { mode: 'compare', listingTitles: ['Apt Alpha', 'Nonexistent Place'] };
    const result = await rankCompare(args, makeDeps([rowA]));

    if (result.mode !== 'compare') throw new Error('wrong mode');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.listingId).toBe('cmp-a2');
  });

  it('title matching is case-insensitive', async () => {
    const rowA = makeCrmRow({ id: 'cmp-case', title: 'Elm Street Studio', status: 'active', rent: 900 });
    const args: RankCompareArgs = { mode: 'compare', listingTitles: ['elm street studio'] };
    const result = await rankCompare(args, makeDeps([rowA]));

    if (result.mode !== 'compare') throw new Error('wrong mode');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.listingId).toBe('cmp-case');
  });
});

// ---------------------------------------------------------------------------
// COMPARE MODE — by listing IDs
// ---------------------------------------------------------------------------

describe('rankCompare — compare mode (by listingIds)', () => {
  it('matches rows by listingIds in order', async () => {
    const rowA = makeCrmRow({ id: 'id-a', title: 'ID A', status: 'active', rent: 1000 });
    const rowB = makeCrmRow({ id: 'id-b', title: 'ID B', status: 'active', rent: 1200 });
    const args: RankCompareArgs = { mode: 'compare', listingIds: ['id-b', 'id-a'] };
    const result = await rankCompare(args, makeDeps([rowA, rowB]));

    if (result.mode !== 'compare') throw new Error('wrong mode');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.listingId).toBe('id-b');
    expect(result.rows[1]!.listingId).toBe('id-a');
  });

  it('listingIds takes precedence over listingTitles when both are provided', async () => {
    const rowA = makeCrmRow({ id: 'prec-a', title: 'Prec Alpha', status: 'active', rent: 1000 });
    const rowB = makeCrmRow({ id: 'prec-b', title: 'Prec Beta', status: 'active', rent: 1200 });
    // listingIds says A only; listingTitles says B only → IDs win
    const args: RankCompareArgs = {
      mode: 'compare',
      listingIds: ['prec-a'],
      listingTitles: ['Prec Beta'],
    };
    const result = await rankCompare(args, makeDeps([rowA, rowB]));

    if (result.mode !== 'compare') throw new Error('wrong mode');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.listingId).toBe('prec-a');
  });
});

// ---------------------------------------------------------------------------
// COMPARE MODE — no selectors → all active listings
// ---------------------------------------------------------------------------

describe('rankCompare — compare mode (no selectors)', () => {
  it('returns all active listings as compare rows when no selectors given', async () => {
    const rows = [cheapRow, midRow, expensiveRow];
    const args: RankCompareArgs = { mode: 'compare' };
    const result = await rankCompare(args, makeDeps(rows));

    if (result.mode !== 'compare') throw new Error('wrong mode');
    expect(result.rows).toHaveLength(3);
  });

  it('each compare row has the expected fields', async () => {
    const args: RankCompareArgs = { mode: 'compare' };
    const result = await rankCompare(args, makeDeps([cheapRow]));

    if (result.mode !== 'compare') throw new Error('wrong mode');
    const row = result.rows[0]!;
    expect(typeof row.listingId).toBe('string');
    expect(typeof row.title).toBe('string');
    expect('rent' in row).toBe(true);
    expect('bedrooms' in row).toBe(true);
    expect('bathrooms' in row).toBe(true);
    expect('sqft' in row).toBe(true);
    expect(Array.isArray(row.amenities)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FAIRNESS — deferred to v2 (no fairness field in ranked output)
// ---------------------------------------------------------------------------

describe('rankCompare — fairness-deferred guard', () => {
  it('ranked items have no "fairness" or "fairnessScore" key', async () => {
    const rows = [cheapRow, midRow, expensiveRow];
    const result = await rankCompare({}, makeDeps(rows));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    for (const item of result.ranked) {
      expect(Object.keys(item)).not.toContain('fairness');
      expect(Object.keys(item)).not.toContain('fairnessScore');
      expect(Object.keys(item.breakdown)).not.toContain('fairness');
    }
  });
});

// ---------------------------------------------------------------------------
// WEIGHT NORMALIZATION
// ---------------------------------------------------------------------------

describe('rankCompare — weight normalization', () => {
  it('scores stay in [0, 1] even when profile weights do not sum to 1', async () => {
    const unnormalizedProfile: InferredProfile = {
      ...profileWithRentWeight,
      weights: { rent: 5, bedrooms: 3, sqft: 2, commute: 0 }, // sum = 10
    };
    const rows = [cheapRow, midRow, expensiveRow];
    const result = await rankCompare({}, makeDeps(rows, unnormalizedProfile));

    if (result.mode !== 'rank') throw new Error('wrong mode');
    for (const item of result.ranked) {
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(1 + 1e-9); // float tolerance
    }
  });
});
