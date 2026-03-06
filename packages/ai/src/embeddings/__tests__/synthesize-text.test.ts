import { describe, it, expect } from 'vitest';
import { synthesizeListingText } from '../synthesize-text';

describe('synthesizeListingText', () => {
  it('produces rich text from a full listing', () => {
    const text = synthesizeListingText({
      address: '123 Langdon St, Madison, WI',
      rentMonthly: 1200,
      bedrooms: 2,
      bathrooms: 1,
      sqft: 800,
      amenities: ['in-unit laundry', 'parking', 'dishwasher'],
      photoCount: 5,
    });

    expect(text).toContain('123 Langdon St');
    expect(text).toContain('1200');
    expect(text).toContain('2 bedroom');
    expect(text).toContain('1 bathroom');
    expect(text).toContain('800');
    expect(text).toContain('in-unit laundry');
    expect(text).toContain('parking');
    // Should include neighborhood context for Langdon
    expect(text.toLowerCase()).toContain('near campus');
    // Should include vibe descriptors
    expect(text.toLowerCase()).toContain('convenient');
  });

  it('handles null fields gracefully', () => {
    const text = synthesizeListingText({
      address: '456 Main St, Madison, WI',
      rentMonthly: null,
      bedrooms: null,
      bathrooms: null,
      sqft: null,
      amenities: [],
      photoCount: 0,
    });

    expect(text).toContain('456 Main St');
    // Should not contain undefined or null strings
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
    // Should still be a reasonable length
    expect(text.length).toBeGreaterThan(10);
  });

  it('derives vibe descriptors from amenities', () => {
    const textWithPool = synthesizeListingText({
      address: '789 University Ave, Madison, WI',
      rentMonthly: 1500,
      bedrooms: 3,
      bathrooms: 2,
      sqft: 1200,
      amenities: ['pool', 'gym', 'pet-friendly'],
      photoCount: 3,
    });

    expect(textWithPool.toLowerCase()).toContain('active lifestyle');
    expect(textWithPool.toLowerCase()).toContain('pet');
  });

  it('includes neighborhood context for known Madison areas', () => {
    const stateStListing = synthesizeListingText({
      address: '100 State St, Madison, WI',
      rentMonthly: 1000,
      bedrooms: 1,
      bathrooms: 1,
      sqft: 500,
      amenities: [],
      photoCount: 0,
    });

    expect(stateStListing.toLowerCase()).toContain('downtown');
  });

  it('returns a string (not undefined)', () => {
    const result = synthesizeListingText({
      address: '100 Test Dr',
      rentMonthly: 900,
      bedrooms: 1,
      bathrooms: 1,
      sqft: null,
      amenities: [],
      photoCount: 0,
    });

    expect(typeof result).toBe('string');
  });
});
