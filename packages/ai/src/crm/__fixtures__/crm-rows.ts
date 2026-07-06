/**
 * Reusable CrmListingRow fixtures for CRM tests (AIN-15).
 *
 * Use the pre-built array constants for the common scenarios
 * (rank/infer tests need varied rent/bedrooms/sqft/amenities/coords),
 * or use makeCrmRow() for custom variants.
 */

import type { CrmListingRow } from '../types';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _idCounter = 1;

/**
 * Build a CrmListingRow with sensible defaults, overridden by the caller.
 * Each call without an explicit `id` gets a unique auto-incrementing ID
 * (reset is not needed; tests that need stable IDs should pass one explicitly).
 * Returns a new object — never mutates the template.
 */
export function makeCrmRow(overrides: Partial<CrmListingRow> = {}): CrmListingRow {
  const id = overrides.id ?? `row-${_idCounter++}`;
  // Build defaults first so source_url can reference the resolved id.
  // The spread of `overrides` then replaces any field the caller wants to change.
  // `id` is captured before the spread so it can't be widened back by an accidental
  // duplicate in overrides (the local `id` variable above is authoritative).
  const defaults: CrmListingRow = {
    id,
    user_id: 'user-abc',
    source_url: `https://zillow.com/homedetails/${id}_zpid/`,
    source_site: 'zillow.com',
    title: '2BR/1BA Near Campus',
    nickname: null,
    address: '123 Main St, Madison, WI 53706',
    rent: 1400,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 850,
    available_from: '2026-08-01',
    description: 'Spacious apartment with parking.',
    amenities: ['In-Unit Laundry', 'Off-Street Parking'],
    photo_urls: ['https://example.com/photo.jpg'],
    extraction_confidence: 0.9,
    status: 'active',
    user_notes: null,
    latitude: 43.0731,
    longitude: -89.4012,
    saved_at: '2026-05-20T12:00:00Z',
  };
  return { ...defaults, ...overrides, id };
}

// ---------------------------------------------------------------------------
// Pre-built arrays
// ---------------------------------------------------------------------------

/** Single saved listing — triggers inferProfile needs_more_data path. */
export const singleRow: CrmListingRow[] = [
  makeCrmRow({
    id: 'crm-single-1',
    rent: 1200,
    bedrooms: 1,
    sqft: 600,
    amenities: ['WiFi'],
    latitude: 43.0731,
    longitude: -89.4012,
  }),
];

/**
 * Two saved listings — still below the default minSavesForInference=3 threshold.
 */
export const twoSavedRows: CrmListingRow[] = [
  makeCrmRow({
    id: 'crm-two-1',
    rent: 1100,
    bedrooms: 1,
    sqft: 550,
    amenities: ['WiFi', 'Heat Included'],
    latitude: 43.075,
    longitude: -89.402,
  }),
  makeCrmRow({
    id: 'crm-two-2',
    rent: 1350,
    bedrooms: 2,
    sqft: 800,
    amenities: ['In-Unit Laundry'],
    latitude: 43.074,
    longitude: -89.403,
  }),
];

/**
 * Three saved listings — meets the default minSavesForInference=3 threshold.
 * Varied rent/bedrooms for infer tests.
 */
export const threeSavedRows: CrmListingRow[] = [
  makeCrmRow({
    id: 'crm-three-1',
    title: 'Studio on State St',
    rent: 900,
    bedrooms: 0,
    bathrooms: 1,
    sqft: 420,
    amenities: ['WiFi', 'Utilities Included'],
    latitude: 43.0765,
    longitude: -89.3995,
    extraction_confidence: 0.9,
  }),
  makeCrmRow({
    id: 'crm-three-2',
    title: '1BR Near Engineering',
    rent: 1150,
    bedrooms: 1,
    bathrooms: 1,
    sqft: 630,
    amenities: ['Off-Street Parking', 'In-Unit Laundry'],
    latitude: 43.0712,
    longitude: -89.4087,
    extraction_confidence: 0.6,
  }),
  makeCrmRow({
    id: 'crm-three-3',
    title: '2BR on University Ave',
    rent: 1600,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 950,
    amenities: ['In-Unit Laundry', 'Dishwasher', 'Balcony'],
    latitude: 43.0748,
    longitude: -89.4035,
    extraction_confidence: 0.9,
    status: 'toured',
  }),
];

/**
 * Five saved listings — well above inference threshold; for confident profile
 * inference tests and rank/compare scenarios.
 */
export const fiveSavedRows: CrmListingRow[] = [
  ...threeSavedRows,
  makeCrmRow({
    id: 'crm-five-4',
    title: '2BR/2BA Premium',
    rent: 2000,
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1100,
    amenities: ['In-Unit Laundry', 'Parking', 'Gym', 'Rooftop Deck'],
    latitude: 43.0688,
    longitude: -89.3978,
    extraction_confidence: 0.9,
    status: 'active',
  }),
  makeCrmRow({
    id: 'crm-five-5',
    title: 'Cheap Studio Far from Campus',
    rent: 700,
    bedrooms: 0,
    bathrooms: 1,
    sqft: 380,
    amenities: [],
    latitude: 43.0621,
    longitude: -89.4145,
    extraction_confidence: 0.3,
    status: 'declined',
  }),
];
