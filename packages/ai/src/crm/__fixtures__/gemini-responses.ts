/**
 * Canned Gemini response strings for CRM unit tests (AIN-15).
 *
 * Each constant mirrors what `result.text` would contain in a real Gemini
 * JSON-mode response. Tests use these to stub the Gemini client without
 * making real API calls.
 *
 * Keep these as plain strings (not parsed objects) — the CRM modules parse
 * them via JSON.parse, and test coverage of bad JSON handling requires an
 * unparseable string.
 */

// ---------------------------------------------------------------------------
// Red-flag scan responses
// ---------------------------------------------------------------------------

/**
 * Well-formed red-flag scan result with two flags.
 * Shape: { flags: string[]; summary: string }
 */
export const cannedRedFlagResponse: string = JSON.stringify({
  flags: [
    'Landlord requires full year of rent upfront — unusual and potentially illegal in WI',
    'No mention of heating included despite Wisconsin winters — budget $150-200/mo extra',
  ],
  summary:
    'Two moderate red flags: atypical upfront payment demand and undisclosed utility responsibility.',
});

/**
 * Red-flag scan result with no flags found — represents a clean listing.
 */
export const cannedRedFlagClearResponse: string = JSON.stringify({
  flags: [],
  summary: 'No significant red flags detected. Listing appears straightforward.',
});

// ---------------------------------------------------------------------------
// Inferred profile responses
// ---------------------------------------------------------------------------

/**
 * Well-formed inferred profile result matching the InferredProfile shape.
 * Shape: { rent_min, rent_max, bedrooms_target, must_have_amenities,
 *           nice_to_have_amenities, home_base_address, commute_max_minutes,
 *           weights, confidence }
 */
export const cannedInferredProfileResponse: string = JSON.stringify({
  rent_min: 900,
  rent_max: 1600,
  bedrooms_target: 1,
  must_have_amenities: ['In-Unit Laundry', 'WiFi'],
  nice_to_have_amenities: ['Off-Street Parking', 'Dishwasher'],
  home_base_address: '1415 Engineering Dr, Madison, WI 53706',
  commute_max_minutes: 15,
  weights: {
    rent: 0.4,
    bedrooms: 0.2,
    laundry: 0.2,
    location: 0.2,
  },
  confidence: 0.7,
});

/**
 * Inferred profile with null optional fields — tests that the module handles
 * sparse profiles (e.g. student hasn't indicated home base yet).
 */
export const cannedInferredProfileSparseResponse: string = JSON.stringify({
  rent_min: null,
  rent_max: 1500,
  bedrooms_target: null,
  must_have_amenities: [],
  nice_to_have_amenities: ['Parking'],
  home_base_address: null,
  commute_max_minutes: null,
  weights: { rent: 0.6, location: 0.4 },
  confidence: 0.3,
});

// ---------------------------------------------------------------------------
// Malformed / error cases
// ---------------------------------------------------------------------------

/**
 * Unparseable JSON string — used to test that modules handle Gemini returning
 * garbled output without crashing (should degrade gracefully).
 */
export const malformedJsonResponse: string =
  '{ "flags": ["missing closing bracket", ... ';

/**
 * Syntactically valid JSON but wrong shape — used to test schema validation
 * paths (e.g. Zod safeParse or manual shape checks in the CRM modules).
 */
export const wrongShapeResponse: string = JSON.stringify({
  unexpected_field: true,
  data: [1, 2, 3],
});
