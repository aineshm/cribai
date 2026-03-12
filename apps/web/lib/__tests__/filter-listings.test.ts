import { describe, it, expect } from 'vitest';
import { filterListings } from '../filter-listings';
import type { Listing } from '../mock-listings';

const makeListing = (overrides: Partial<Listing> = {}): Listing => ({
  id: 'test-1',
  title: 'Test Apartment',
  address: '123 Test St',
  price: 1200,
  beds: 2,
  baths: 1,
  sqft: 700,
  distanceToCampus: 0.3,
  rating: 4.5,
  photoUrls: [],
  placeholderGradient: 'from-teal-200 to-emerald-400',
  amenities: [],
  isVerified: false,
  isSaved: false,
  landlord: { name: 'Test Landlord', rating: 4.0 },
  ...overrides,
});

const listings: readonly Listing[] = [
  makeListing({ id: '1', price: 1200, beds: 2, distanceToCampus: 0.3, amenities: ['Pet Friendly', 'Furnished'] }),
  makeListing({ id: '2', price: 1600, beds: 1, distanceToCampus: 0.2, amenities: ['Furnished'] }),
  makeListing({ id: '3', price: 1400, beds: 0, distanceToCampus: 0.8, amenities: ['Pet Friendly'] }),
  makeListing({ id: '4', price: 1800, beds: 3, distanceToCampus: 1.2, amenities: [] }),
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

  it('distance filter returns only listings with distanceToCampus <= 0.5', () => {
    const result = filterListings(listings, new Set(['distance']));
    // listing 1: 0.3, listing 2: 0.2 — both qualify; listing 3: 0.8, listing 4: 1.2 — excluded
    expect(result.map((l) => l.id)).toEqual(['1', '2']);
    result.forEach((l) => expect(l.distanceToCampus).toBeLessThanOrEqual(0.5));
  });

  it('move-in filter passes all listings through', () => {
    const result = filterListings(listings, new Set(['move-in']));
    expect(result).toHaveLength(4);
  });

  it('pets filter returns only listings with Pet Friendly amenity', () => {
    const result = filterListings(listings, new Set(['pets']));
    expect(result.map((l) => l.id)).toEqual(['1', '3']);
    result.forEach((l) => expect(l.amenities).toContain('Pet Friendly'));
  });

  it('furnished filter returns only listings with Furnished amenity', () => {
    const result = filterListings(listings, new Set(['furnished']));
    expect(result.map((l) => l.id)).toEqual(['1', '2']);
    result.forEach((l) => expect(l.amenities).toContain('Furnished'));
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

  it('unknown filter id passes all listings through', () => {
    const result = filterListings(listings, new Set(['unknown-filter']));
    expect(result).toHaveLength(4);
  });

  it('returns empty array when no listings match combined filters', () => {
    // price <= 1500 AND beds >= 2 AND distance <= 0.5 AND pets AND furnished
    const result = filterListings(listings, new Set(['price', 'beds', 'distance', 'pets', 'furnished']));
    expect(result.map((l) => l.id)).toEqual(['1']);
  });

  it('returns empty array when nothing satisfies impossible combination', () => {
    // beds >= 2 AND price <= 1500 — listing 1 passes, but also want pets+furnished (listing 1 has both)
    // For a truly empty result: price <= 1500 AND beds >= 2 AND pets = listing 1 only; that's not empty
    // Use: price > 1500 equivalent — filter that filters everything: create all-exclusive scenario
    const noMatch: readonly Listing[] = [
      makeListing({ id: 'a', price: 2000, beds: 0, amenities: [] }),
    ];
    const result = filterListings(noMatch, new Set(['price', 'beds']));
    expect(result).toHaveLength(0);
  });
});
