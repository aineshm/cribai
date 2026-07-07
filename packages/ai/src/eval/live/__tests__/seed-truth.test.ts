/**
 * AIN-93 Task 2 — seed set shape pinned: 8 rows, one building row with
 * floor_plans + price_is_from, one archived row, every row nicknamed.
 */
import { describe, expect, it } from 'vitest';
import {
  SEED_LISTING_KEYS,
  SEED_LISTINGS,
  seedListingsList,
  buildSeedInsertRows,
  fixtureSourceUrl,
} from '../seed-truth';

describe('seed-truth — fixed 8-row set', () => {
  it('has exactly 8 keys', () => {
    expect(SEED_LISTING_KEYS).toHaveLength(8);
    expect(seedListingsList()).toHaveLength(8);
  });

  it('every row has a non-empty nickname', () => {
    for (const truth of seedListingsList()) {
      expect(typeof truth.nickname).toBe('string');
      expect(truth.nickname.length).toBeGreaterThan(0);
    }
  });

  it('every row has a fixture source_url under the reserved .invalid TLD', () => {
    for (const truth of seedListingsList()) {
      expect(truth.sourceUrl).toBe(fixtureSourceUrl(truth.key));
      expect(truth.sourceUrl).toMatch(/^https:\/\/ain93-fixture\.invalid\//);
    }
  });

  it('has exactly one archived row that must never appear in answers', () => {
    const archived = seedListingsList().filter((t) => t.status === 'archived');
    expect(archived).toHaveLength(1);
    expect(archived[0]!.key).toBe('archived');
  });

  it('has exactly one building row with 3-5 floor plans and price_is_from', () => {
    const building = SEED_LISTINGS.building;
    expect(building.floorPlans).toBeDefined();
    expect(building.floorPlans!.length).toBeGreaterThanOrEqual(3);
    expect(building.floorPlans!.length).toBeLessThanOrEqual(5);
    expect(building.priceIsFrom).toBe(true);
  });

  it('the building row top-level fields mirror the cheapest floor plan', () => {
    const building = SEED_LISTINGS.building;
    const cheapest = [...building.floorPlans!].sort(
      (a, b) => (a.rent_min ?? Infinity) - (b.rent_min ?? Infinity),
    )[0]!;
    expect(building.rent).toBe(cheapest.rent_min);
    expect(building.bedrooms).toBe(cheapest.bedrooms);
    expect(building.bathrooms).toBe(cheapest.bathrooms);
    expect(building.sqft).toBe(cheapest.sqft);
  });

  it('non-building rows carry no floor plans', () => {
    for (const truth of seedListingsList()) {
      if (truth.key === 'building') continue;
      expect(truth.floorPlans).toBeUndefined();
    }
  });

  it('spreads rent across a wide range (not all identical)', () => {
    const rents = seedListingsList()
      .map((t) => t.rent)
      .filter((r): r is number => r !== null);
    expect(new Set(rents).size).toBeGreaterThan(4);
  });
});

describe('buildSeedInsertRows', () => {
  const rows = buildSeedInsertRows('user-123');

  it('builds 8 rows, each owned by the given userId', () => {
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row.user_id).toBe('user-123');
    }
  });

  it('only the building row insert carries a deep_extract subtree', () => {
    for (const [i, key] of SEED_LISTING_KEYS.entries()) {
      const row = rows[i]!;
      const rawExtraction = row.raw_extraction as Record<string, unknown>;
      if (key === 'building') {
        expect(rawExtraction.deep_extract).toBeDefined();
        const deepExtract = rawExtraction.deep_extract as Record<string, unknown>;
        expect(Array.isArray(deepExtract.floor_plans)).toBe(true);
        expect(deepExtract.price_is_from).toBe(true);
      } else {
        expect(rawExtraction.deep_extract).toBeUndefined();
      }
    }
  });

  it('preserves status (archived row inserts as archived)', () => {
    const archivedRow = rows[SEED_LISTING_KEYS.indexOf('archived')]!;
    expect(archivedRow.status).toBe('archived');
  });
});
