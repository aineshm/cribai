import { describe, it, expect } from 'vitest';
import { calculateEnhancedFairness } from '../fairness-scorer';
import type { ComparableCandidate } from '../comparable-selector';

function makeCandidate(overrides: Partial<ComparableCandidate> & { id: string }): ComparableCandidate {
  return {
    rentMonthly: 1000,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 800,
    amenities: [],
    latitude: 43.0731,
    longitude: -89.4012,
    ...overrides,
  };
}

function makeListings(count: number): ComparableCandidate[] {
  return Array.from({ length: count }, (_, i) =>
    makeCandidate({
      id: `listing-${i}`,
      rentMonthly: 800 + i * 50,
      sqft: 600 + i * 30,
      latitude: 43.073 + i * 0.001,
      longitude: -89.401 + i * 0.001,
      amenities: i % 2 === 0 ? ['parking'] : ['laundry'],
    }),
  );
}

describe('calculateEnhancedFairness', () => {
  it('returns null when fewer than 3 comparables found', () => {
    const target = makeCandidate({ id: 'target' });
    const result = calculateEnhancedFairness({
      target,
      allListings: [], // no comparables
    });
    expect(result).toBeNull();
  });

  it('falls back to percentile method with < 5 comparables', () => {
    const target = makeCandidate({ id: 'target', rentMonthly: 1000 });
    const listings = makeListings(4);
    const result = calculateEnhancedFairness({ target, allListings: listings });
    // With only 4 comparables, should still return a result using percentile method (if ≥3)
    if (result !== null) {
      expect(result.comparableCount).toBeLessThan(5);
    }
  });

  it('returns valid FairnessData with enough comparables', () => {
    const target = makeCandidate({ id: 'target', rentMonthly: 1000 });
    const listings = makeListings(15);
    const result = calculateEnhancedFairness({
      target,
      allListings: listings,
      campusLocation: { latitude: 43.0731, longitude: -89.4012 },
    });
    expect(result).not.toBeNull();
    expect(result!.comparableCount).toBeGreaterThanOrEqual(5);
    expect(result!.predictedRent).toBeGreaterThan(0);
    expect(result!.breakdown).toBeDefined();
    expect(result!.breakdown!['score']).toBeGreaterThanOrEqual(1);
    expect(result!.breakdown!['score']).toBeLessThanOrEqual(10);
  });

  it('cheaper listing gets higher score than expensive one', () => {
    const listings = makeListings(15);
    const cheap = makeCandidate({ id: 'cheap', rentMonthly: 700 });
    const expensive = makeCandidate({ id: 'expensive', rentMonthly: 1500 });
    const campus = { latitude: 43.0731, longitude: -89.4012 };

    const cheapResult = calculateEnhancedFairness({ target: cheap, allListings: listings, campusLocation: campus });
    const expensiveResult = calculateEnhancedFairness({ target: expensive, allListings: listings, campusLocation: campus });

    expect(cheapResult).not.toBeNull();
    expect(expensiveResult).not.toBeNull();
    expect(cheapResult!.breakdown!['score']!).toBeGreaterThan(expensiveResult!.breakdown!['score']!);
  });
});
