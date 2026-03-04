import { describe, it, expect } from 'vitest';
import { selectComparables, type ComparableCandidate } from '../comparable-selector';

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

describe('selectComparables', () => {
  const target = makeCandidate({ id: 'target' });

  it('returns empty array when no candidates', () => {
    expect(selectComparables(target, [])).toEqual([]);
  });

  it('filters by bedroom match', () => {
    const candidates = [
      makeCandidate({ id: '1', bedrooms: 2 }),
      makeCandidate({ id: '2', bedrooms: 3 }),
      makeCandidate({ id: '3', bedrooms: 1 }),
    ];
    const result = selectComparables(target, candidates, { bedroomMatch: true });
    expect(result.every((c) => c.bedrooms === 2)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('filters by max distance', () => {
    const candidates = [
      makeCandidate({ id: 'near', latitude: 43.074, longitude: -89.402 }), // ~0.1km
      makeCandidate({ id: 'far', latitude: 44.0, longitude: -89.4 }),      // ~100km
    ];
    const result = selectComparables(target, candidates, { maxDistanceKm: 3 });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('near');
  });

  it('ranks closer listings higher', () => {
    const candidates = [
      makeCandidate({ id: 'farther', latitude: 43.09, longitude: -89.41 }),
      makeCandidate({ id: 'closer', latitude: 43.074, longitude: -89.402 }),
    ];
    const result = selectComparables(target, candidates, { maxDistanceKm: 10 });
    expect(result[0]!.id).toBe('closer');
  });

  it('respects maxResults limit', () => {
    const candidates = Array.from({ length: 30 }, (_, i) =>
      makeCandidate({ id: `c${i}`, latitude: 43.073 + i * 0.0001 }),
    );
    const result = selectComparables(target, candidates, { maxResults: 5 });
    expect(result).toHaveLength(5);
  });

  it('handles null lat/lng by excluding from geo filtering', () => {
    const candidates = [
      makeCandidate({ id: 'no-geo', latitude: null, longitude: null }),
      makeCandidate({ id: 'has-geo', latitude: 43.074, longitude: -89.402 }),
    ];
    const result = selectComparables(target, candidates, { maxDistanceKm: 3 });
    // null geo candidates are excluded
    expect(result.find((c) => c.id === 'no-geo')).toBeUndefined();
    expect(result).toHaveLength(1);
  });

  it('handles null sqft by ignoring sqft similarity', () => {
    const candidates = [
      makeCandidate({ id: 'no-sqft', sqft: null, latitude: 43.074, longitude: -89.402 }),
    ];
    const result = selectComparables(target, candidates, { maxDistanceKm: 10 });
    expect(result).toHaveLength(1);
  });

  it('amenity overlap affects ranking', () => {
    const targetWithAmenities = makeCandidate({
      id: 'target',
      amenities: ['parking', 'laundry', 'ac', 'pool'],
    });
    const candidates = [
      makeCandidate({
        id: 'low-overlap',
        amenities: ['gym'],
        latitude: 43.074,
        longitude: -89.402,
      }),
      makeCandidate({
        id: 'high-overlap',
        amenities: ['parking', 'laundry', 'ac'],
        latitude: 43.074,
        longitude: -89.402,
      }),
    ];
    const result = selectComparables(targetWithAmenities, candidates, {
      maxDistanceKm: 10,
      amenityWeight: 1,
    });
    expect(result[0]!.id).toBe('high-overlap');
  });
});
