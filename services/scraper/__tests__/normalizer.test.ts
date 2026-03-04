import { describe, it, expect } from 'vitest';
import { normalizeListing } from '../normalizer';
import type { RawListing } from '../scrapers/base-scraper';

function makeRaw(overrides: Partial<RawListing> = {}): RawListing {
  return {
    externalId: 'ext-123',
    source: 'apartments.com',
    address: '123 Main St',
    rentMonthly: 1200,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 800,
    amenities: [],
    availableDate: '2026-06-01',
    latitude: 43.0766,
    longitude: -89.4012,
    rawData: { url: 'https://example.com' },
    ...overrides,
  };
}

describe('normalizeListing', () => {
  // Amenity aliasing
  it('normalizes "w/d" to "washer_dryer"', () => {
    const result = normalizeListing(makeRaw({ amenities: ['w/d'] }));
    expect(result.amenities).toEqual(['washer_dryer']);
  });

  it('normalizes "Central Air" to "air_conditioning"', () => {
    const result = normalizeListing(makeRaw({ amenities: ['Central Air'] }));
    expect(result.amenities).toEqual(['air_conditioning']);
  });

  it('normalizes "Pet Friendly" to "pets_allowed"', () => {
    const result = normalizeListing(makeRaw({ amenities: ['Pet Friendly'] }));
    expect(result.amenities).toEqual(['pets_allowed']);
  });

  it('deduplicates amenities', () => {
    const result = normalizeListing(
      makeRaw({ amenities: ['w/d', 'Washer/Dryer', 'in-unit laundry'] }),
    );
    expect(result.amenities).toEqual(['washer_dryer']);
  });

  it('handles unknown amenities by snake_casing', () => {
    const result = normalizeListing(
      makeRaw({ amenities: ['Rooftop Deck'] }),
    );
    expect(result.amenities).toEqual(['rooftop_deck']);
  });

  // Address cleaning
  it('trims whitespace from address', () => {
    const result = normalizeListing(makeRaw({ address: '  123 Main St  ' }));
    expect(result.address).toBe('123 Main St');
  });

  // Rent rounding
  it('rounds rent to 2 decimal places', () => {
    const result = normalizeListing(makeRaw({ rentMonthly: 1200.456 }));
    expect(result.rentMonthly).toBe(1200.46);
  });

  // Pass-through fields
  it('preserves externalId, source, rawData', () => {
    const raw = makeRaw();
    const result = normalizeListing(raw);
    expect(result.externalId).toBe('ext-123');
    expect(result.source).toBe('apartments.com');
    expect(result.rawData).toEqual({ url: 'https://example.com' });
  });

  it('preserves null bedrooms/bathrooms/sqft', () => {
    const result = normalizeListing(
      makeRaw({ bedrooms: null, bathrooms: null, sqft: null }),
    );
    expect(result.bedrooms).toBeNull();
    expect(result.bathrooms).toBeNull();
    expect(result.sqft).toBeNull();
  });

  // Edge cases
  it('handles empty amenities array', () => {
    const result = normalizeListing(makeRaw({ amenities: [] }));
    expect(result.amenities).toEqual([]);
  });

  it('handles amenities with extra whitespace', () => {
    const result = normalizeListing(
      makeRaw({ amenities: ['  w/d  ', '  Central Air  '] }),
    );
    expect(result.amenities).toEqual(['washer_dryer', 'air_conditioning']);
  });

  it('collapses multiple spaces in unknown amenities', () => {
    const result = normalizeListing(
      makeRaw({ amenities: ['Bike   Storage'] }),
    );
    expect(result.amenities).toEqual(['bike_storage']);
  });
});
