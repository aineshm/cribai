import { describe, it, expect } from 'vitest';
import { filterListings } from '../filter-listings';
import type { ExploreListing } from '../listing-types';

const makeListing = (overrides: Partial<ExploreListing> = {}): ExploreListing => ({
  id: 'test-1',
  title: 'Test Apartment',
  address: '123 Test St',
  price: 1200,
  beds: 2,
  baths: 1,
  sqft: 700,
  photoUrl: null,
  amenities: [],
  source: 'zillow',
  sourceUrl: null,
  fairnessScore: null,
  availableDate: null,
  walkScore: 90,
  latitude: null,
  longitude: null,
  ...overrides,
});

const listings: readonly ExploreListing[] = [
  makeListing({ id: '1', price: 1200, beds: 2, walkScore: 85, amenities: ['Pet Friendly', 'Furnished'], availableDate: '2026-08-01' }),
  makeListing({ id: '2', price: 1600, beds: 1, walkScore: 95, amenities: ['Furnished'], availableDate: '2026-08-15' }),
  makeListing({ id: '3', price: 1400, beds: 0, walkScore: 60, amenities: ['Pet Friendly'], availableDate: null }),
  makeListing({ id: '4', price: 1800, beds: 3, walkScore: 50, amenities: [] }),
];

describe('filterListings', () => {
  it('returns all listings when filters are empty', () => {
    const result = filterListings(listings, new Set());
    expect(result).toHaveLength(4);
  });

  it('price filter returns only listings with price <= 1500', () => {
    const result = filterListings(listings, new Set(['price']));
    expect(result.map((l) => l.id)).toEqual(['1', '3']);
    result.forEach((l) => expect(l.price).toBeLessThanOrEqual(1500));
  });

  it('beds filter returns only listings with beds >= 2', () => {
    const result = filterListings(listings, new Set(['beds']));
    expect(result.map((l) => l.id)).toEqual(['1', '4']);
    result.forEach((l) => expect(l.beds).toBeGreaterThanOrEqual(2));
  });

  it('distance filter returns listings with walkScore >= 80', () => {
    const result = filterListings(listings, new Set(['distance']));
    // listing 1: 85, listing 2: 95 — both qualify; listing 3: 60, listing 4: 50 — excluded
    expect(result.map((l) => l.id)).toEqual(['1', '2']);
    result.forEach((l) => expect(l.walkScore).toBeGreaterThanOrEqual(80));
  });

  it('move-in filter returns listings with an available date', () => {
    const result = filterListings(listings, new Set(['move-in']));
    // listing 1 and 2 have dates, listing 3 and 4 do not
    expect(result.map((l) => l.id)).toEqual(['1', '2']);
  });

  it('pets filter returns only listings with Pet Friendly amenity', () => {
    const result = filterListings(listings, new Set(['pets']));
    expect(result.map((l) => l.id)).toEqual(['1', '3']);
  });

  it('furnished filter returns only listings with Furnished amenity', () => {
    const result = filterListings(listings, new Set(['furnished']));
    expect(result.map((l) => l.id)).toEqual(['1', '2']);
  });

  it('multiple filters apply AND logic', () => {
    // price <= 1500 AND beds >= 2 — only listing 1 qualifies
    const result = filterListings(listings, new Set(['price', 'beds']));
    expect(result.map((l) => l.id)).toEqual(['1']);
  });

  it('pets + furnished AND logic returns only listings with both amenities', () => {
    const result = filterListings(listings, new Set(['pets', 'furnished']));
    expect(result.map((l) => l.id)).toEqual(['1']);
  });

  it('sublease filter returns only sublease listings', () => {
    const withSublease: readonly ExploreListing[] = [
      ...listings,
      makeListing({ id: '5', source: 'sublease', price: 900 }),
      makeListing({ id: '6', source: 'sublease', price: 1100 }),
    ];
    const result = filterListings(withSublease, new Set(['sublease']));
    expect(result.map((l) => l.id)).toEqual(['5', '6']);
    result.forEach((l) => expect(l.source).toBe('sublease'));
  });

  it('unknown filter id passes all listings through', () => {
    const result = filterListings(listings, new Set(['unknown-filter']));
    expect(result).toHaveLength(4);
  });

  it('returns empty array when nothing satisfies combined filters', () => {
    const noMatch: readonly ExploreListing[] = [
      makeListing({ id: 'a', price: 2000, beds: 0, amenities: [] }),
    ];
    const result = filterListings(noMatch, new Set(['price', 'beds']));
    expect(result).toHaveLength(0);
  });
});
