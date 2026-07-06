/**
 * Tests for the shared FloorPlan schema (AIN-83 Task 1).
 *
 * `FloorPlanSchema` is the single source of truth for a "floor plan" shape —
 * previously duplicated inside the crm_deep_extract mission's synthesize
 * step. This module now owns it so the deterministic Zillow projection
 * (Task 2) and the LLM mission path (Task 4) stay type-identical.
 */

import { describe, it, expect } from 'vitest';
import {
  FloorPlanSchema,
  FloorPlansArraySchema,
  FLOOR_PLAN_MAX_COUNT,
  FLOOR_PLAN_NAME_MAX,
  sanitizePlanName,
  type FloorPlan,
} from '../floor-plan';
import type { ExtractedListing } from '../types';

describe('FloorPlanSchema', () => {
  it('requires name but leaves every other field nullish', () => {
    const parsed = FloorPlanSchema.safeParse({ name: 'Studio' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe('Studio');
      expect(parsed.data.bedrooms).toBeUndefined();
      expect(parsed.data.bathrooms).toBeUndefined();
      expect(parsed.data.rent_min).toBeUndefined();
      expect(parsed.data.rent_max).toBeUndefined();
      expect(parsed.data.sqft).toBeUndefined();
      expect(parsed.data.availability).toBeUndefined();
    }
  });

  it('rejects a missing name', () => {
    expect(FloorPlanSchema.safeParse({ bedrooms: 1 }).success).toBe(false);
  });

  it(`caps name at ${FLOOR_PLAN_NAME_MAX} chars`, () => {
    expect(FloorPlanSchema.safeParse({ name: 'x'.repeat(FLOOR_PLAN_NAME_MAX) }).success).toBe(true);
    expect(FloorPlanSchema.safeParse({ name: 'x'.repeat(FLOOR_PLAN_NAME_MAX + 1) }).success).toBe(false);
  });

  it('rejects out-of-range bedrooms/bathrooms', () => {
    expect(FloorPlanSchema.safeParse({ name: 'A', bedrooms: 21 }).success).toBe(false);
    expect(FloorPlanSchema.safeParse({ name: 'A', bathrooms: -1 }).success).toBe(false);
    expect(FloorPlanSchema.safeParse({ name: 'A', bedrooms: 0 }).success).toBe(true);
  });

  it('rejects non-positive or absurd rent/sqft', () => {
    expect(FloorPlanSchema.safeParse({ name: 'A', rent_min: 0 }).success).toBe(false);
    expect(FloorPlanSchema.safeParse({ name: 'A', rent_min: -100 }).success).toBe(false);
    expect(FloorPlanSchema.safeParse({ name: 'A', rent_min: 60_000 }).success).toBe(false);
    expect(FloorPlanSchema.safeParse({ name: 'A', sqft: 0 }).success).toBe(false);
  });
});

describe('FloorPlansArraySchema (cap raised 20 -> 40, AIN-83)', () => {
  it('exposes FLOOR_PLAN_MAX_COUNT as 40', () => {
    expect(FLOOR_PLAN_MAX_COUNT).toBe(40);
  });

  it('accepts exactly 40 entries', () => {
    const forty = Array.from({ length: 40 }, (_, i) => ({ name: `Plan ${i}` }));
    expect(FloorPlansArraySchema.safeParse(forty).success).toBe(true);
  });

  it('rejects 41 entries', () => {
    const fortyOne = Array.from({ length: 41 }, (_, i) => ({ name: `Plan ${i}` }));
    expect(FloorPlansArraySchema.safeParse(fortyOne).success).toBe(false);
  });
});

describe('sanitizePlanName', () => {
  it('flattens whitespace runs (including newlines) to a single space', () => {
    expect(sanitizePlanName('Studio\n\n"S1"  layout')).toBe('Studio S1 layout');
  });

  it('strips double-quote characters', () => {
    expect(sanitizePlanName('"S1"')).toBe('S1');
  });

  it('trims leading/trailing whitespace', () => {
    expect(sanitizePlanName('  Studio S1  ')).toBe('Studio S1');
  });

  it(`hard-caps length at ${FLOOR_PLAN_NAME_MAX} chars, appending an ellipsis`, () => {
    const long = 'A'.repeat(200);
    const result = sanitizePlanName(long);
    expect(result.length).toBe(FLOOR_PLAN_NAME_MAX);
    expect(result.endsWith('…')).toBe(true);
  });
});

// Type-threading check (compile-time — fails `tsc` if ExtractedListing never
// gained the field, not just at runtime).
describe('ExtractedListing.floor_plans type threading', () => {
  it('accepts an array of FloorPlan on the ExtractedListing shape', () => {
    const plans: FloorPlan[] = [{ name: 'S1' }];
    const listing: ExtractedListing = {
      source_url: 'https://example.com/x',
      source_domain: 'example.com',
      extraction_method: 'json_ld',
      extraction_confidence: 'high',
      floor_plans: plans,
    };
    expect(listing.floor_plans).toHaveLength(1);
    expect(listing.floor_plans?.[0]?.name).toBe('S1');
  });
});
