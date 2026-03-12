import { describe, it, expect } from 'vitest';
import { deduplicateListings, clampTopN } from '../steps/02-deduplicate';
import type { ListingSummary } from '@campusnest/types';

function makeListing(overrides: Partial<ListingSummary> & { address: string }): ListingSummary {
  return {
    id: crypto.randomUUID(),
    address: overrides.address,
    rentMonthly: overrides.rentMonthly ?? 1000,
    bedrooms: overrides.bedrooms ?? 2,
    bathrooms: null,
    sqft: null,
    fairnessScore: null,
    trueCostTotal: null,
    amenities: [],
  };
}

describe('deduplicateListings', () => {
  it('removes address duplicates and keeps the listing with the lowest rent', () => {
    const listings = [
      makeListing({ address: '123 Main St', rentMonthly: 1000 }),
      makeListing({ address: '123 main st', rentMonthly: 900 }), // duplicate, lower rent
    ];
    const result = deduplicateListings(listings);
    expect(result).toHaveLength(1);
    expect(result[0]!.rentMonthly).toBe(900);
  });

  it('does not remove listings with different addresses', () => {
    const listings = [
      makeListing({ address: '123 Main St' }),
      makeListing({ address: '456 Oak Ave' }),
    ];
    const result = deduplicateListings(listings);
    expect(result).toHaveLength(2);
  });

  it('returns an empty array for an empty input', () => {
    expect(deduplicateListings([])).toEqual([]);
  });

  it('normalises whitespace in address comparison', () => {
    const listings = [
      makeListing({ address: '  123 Main St  ', rentMonthly: 1100 }),
      makeListing({ address: '123 Main St', rentMonthly: 1000 }),
    ];
    const result = deduplicateListings(listings);
    expect(result).toHaveLength(1);
    expect(result[0]!.rentMonthly).toBe(1000);
  });
});

describe('clampTopN', () => {
  it('returns 0 when listing count is 0', () => {
    expect(clampTopN(0, 5)).toBe(0);
  });

  it('clamps topN to the actual listing count when less than topN', () => {
    expect(clampTopN(3, 5)).toBe(3);
  });

  it('returns topN unchanged when listing count >= topN', () => {
    expect(clampTopN(10, 5)).toBe(5);
  });
});
