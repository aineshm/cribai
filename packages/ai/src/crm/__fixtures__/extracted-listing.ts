/**
 * Reusable ExtractedListing fixtures for CRM tests (AIN-15).
 *
 * Import the pre-built constants for the common scenarios, or use
 * makeExtractedListing() to generate customised variants without repeating
 * boilerplate.
 */

import type { ExtractedListing } from '../types';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build an ExtractedListing with sensible defaults, overridden by the caller.
 * Returns a new object — never mutates the default template.
 */
export function makeExtractedListing(
  overrides: Partial<ExtractedListing> = {},
): ExtractedListing {
  return {
    source_url: 'https://zillow.com/homedetails/123-main-st/123456789_zpid/',
    source_domain: 'zillow.com',
    title: '2BR/1BA Near Campus',
    description: 'Spacious two-bedroom apartment, in-unit laundry, parking included.',
    price: 1400,
    bedrooms: 2,
    bathrooms: 1,
    square_feet: 850,
    address: '123 Main St, Madison, WI 53706',
    city: 'Madison',
    state: 'WI',
    zip: '53706',
    latitude: 43.0731,
    longitude: -89.4012,
    photos: [
      'https://photos.zillowstatic.com/fp/abc123-main.jpg',
      'https://photos.zillowstatic.com/fp/abc456-kitchen.jpg',
    ],
    amenities: ['In-Unit Laundry', 'Off-Street Parking', 'Dishwasher'],
    available_from: '2026-08-01',
    extraction_method: 'json_ld',
    extraction_confidence: 'high',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pre-built constants
// ---------------------------------------------------------------------------

/**
 * High-confidence listing: JSON-LD extraction, all key fields present
 * (price, address, bedrooms, lat/lng, photos, amenities).
 */
export const highConfidenceListing: ExtractedListing = makeExtractedListing();

/**
 * Medium-confidence listing: has address and price but no geo-coordinates.
 * Represents a listing that will need geocoding in addListing.
 */
export const mediumConfidenceListing: ExtractedListing = makeExtractedListing({
  source_url: 'https://apartments.com/listing/456-elm-ave-madison-wi/',
  source_domain: 'apartments.com',
  title: '1BR Studio Near UW',
  price: 950,
  bedrooms: 1,
  bathrooms: 1,
  square_feet: 500,
  address: '456 Elm Ave, Madison, WI 53703',
  city: 'Madison',
  state: 'WI',
  zip: '53703',
  latitude: undefined,
  longitude: undefined,
  photos: ['https://example.com/photo-studio.jpg'],
  amenities: ['WiFi', 'Heat Included'],
  extraction_method: 'json_ld',
  extraction_confidence: 'medium',
});

/**
 * Low-confidence listing: OG-only extraction, title and price only, no
 * address or coordinates. addListing must handle missing geo gracefully.
 */
export const lowConfidenceOgOnly: ExtractedListing = makeExtractedListing({
  source_url: 'https://craigslist.org/d/apartment/1234567890.html',
  source_domain: 'craigslist.org',
  title: 'Cheap Studio Available Aug 1',
  description: undefined,
  price: 750,
  bedrooms: undefined,
  bathrooms: undefined,
  square_feet: undefined,
  address: undefined,
  city: undefined,
  state: undefined,
  zip: undefined,
  latitude: undefined,
  longitude: undefined,
  photos: [],
  amenities: [],
  available_from: undefined,
  raw_og: {
    'og:title': 'Cheap Studio Available Aug 1',
    'og:description': '$750/mo',
  },
  extraction_method: 'og',
  extraction_confidence: 'low',
});
