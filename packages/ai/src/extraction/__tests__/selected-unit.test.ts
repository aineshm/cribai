/**
 * Tests for the `SelectedUnit` / `RawSelectedUnit` schemas (AIN-98 Task 2).
 *
 * Mirrors floor-plan.ts's own test conventions (bounds pinned individually,
 * not just "schema exists"). `RawSelectedUnitSchema` is what
 * `resolveZillowUnit` returns (no `viewed_at` — that's stamped on at
 * accumulation time by `addListing`); `SelectedUnitSchema` extends it with
 * `viewed_at` for the persisted `deep_extract.units_of_interest` list.
 */
import { describe, it, expect } from 'vitest';
import {
  RawSelectedUnitSchema,
  SelectedUnitSchema,
  SELECTED_UNIT_MAX_COUNT,
  SelectedUnitsArraySchema,
} from '../selected-unit';

describe('RawSelectedUnitSchema', () => {
  it('accepts a minimal valid unit (zpid only)', () => {
    const result = RawSelectedUnitSchema.safeParse({ zpid: '2056051402' });
    expect(result.success).toBe(true);
  });

  it('accepts a fully-populated unit', () => {
    const result = RawSelectedUnitSchema.safeParse({
      zpid: '2056051402',
      unit_number: 'Unit 1405',
      plan_name: 'S1',
      price: 1825,
      bedrooms: 0,
      bathrooms: 1,
      sqft: 547,
      floor: null,
      availability: '2026-07-18',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing zpid', () => {
    const result = RawSelectedUnitSchema.safeParse({ unit_number: 'Unit 1405' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty-string zpid', () => {
    const result = RawSelectedUnitSchema.safeParse({ zpid: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive price (mirrors FloorPlanSchema.rent bounds)', () => {
    const result = RawSelectedUnitSchema.safeParse({ zpid: '1', price: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range bedrooms count (mirrors FloorPlanSchema)', () => {
    const result = RawSelectedUnitSchema.safeParse({ zpid: '1', bedrooms: 21 });
    expect(result.success).toBe(false);
  });
});

describe('SelectedUnitSchema', () => {
  it('requires viewed_at in addition to the raw unit fields', () => {
    const withoutViewedAt = SelectedUnitSchema.safeParse({ zpid: '1' });
    expect(withoutViewedAt.success).toBe(false);

    const withViewedAt = SelectedUnitSchema.safeParse({
      zpid: '1',
      viewed_at: '2026-07-18T07:00:00.000Z',
    });
    expect(withViewedAt.success).toBe(true);
  });

  it('rejects a non-datetime viewed_at', () => {
    const result = SelectedUnitSchema.safeParse({ zpid: '1', viewed_at: 'not-a-date' });
    expect(result.success).toBe(false);
  });
});

describe('SelectedUnitsArraySchema', () => {
  it('caps the array at SELECTED_UNIT_MAX_COUNT (12)', () => {
    expect(SELECTED_UNIT_MAX_COUNT).toBe(12);
    const tooMany = Array.from({ length: 13 }, (_, i) => ({
      zpid: String(i),
      viewed_at: '2026-07-18T07:00:00.000Z',
    }));
    expect(SelectedUnitsArraySchema.safeParse(tooMany).success).toBe(false);
    expect(SelectedUnitsArraySchema.safeParse(tooMany.slice(0, 12)).success).toBe(true);
  });
});
