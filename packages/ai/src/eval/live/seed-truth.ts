/**
 * AIN-93 live-eval harness — the fixed 8-row `crm_listings` seed set.
 *
 * This is the DETERMINISTIC ground truth every hard check diffs against:
 * grounding checks (`checks/grounding.ts`) compare `machineData` fields to
 * these exact values, so any numeric drift the model introduces is a
 * deterministic failure, not a judgment call. Scenarios (`corpus/`) reference
 * rows by `key`, never by a raw UUID — the actual row id is resolved at seed
 * time (service-role insert) and again at run time (lookup by the
 * deterministic `source_url`), so nothing here is a hardcoded database id.
 *
 * Row spread (plan decision 3 / Task 2):
 *   - studio, onebed, twobed_basic, twobed_nice, threebed, fourbed: a spread
 *     of rent/beds/sqft/amenities across single-unit saves.
 *   - building: a Zillow BUILDING-page save (AIN-83) — `deep_extract`
 *     carries the floor-plan breakdown; top-level bedrooms/bathrooms/rent/
 *     sqft mirror the CHEAPEST plan (index 0, sorted by rent_min ascending),
 *     matching real `extractZillowFloorPlans` + AIN-83 derivation behavior.
 *   - archived: `status: 'archived'` — must NEVER appear in an answer.
 *
 * Every row has a `nickname` pre-set (nickname generation is off-path here;
 * this harness tests conversation quality, not the nickname LLM).
 */

export const SEED_LISTING_KEYS = [
  'studio',
  'onebed',
  'twobed_basic',
  'twobed_nice',
  'threebed',
  'fourbed',
  'building',
  'archived',
] as const;

export type SeedListingKey = (typeof SEED_LISTING_KEYS)[number];

/** Reserved-per-RFC-2606 `.invalid` TLD — guarantees no real fetch ever hits this host. */
export const FIXTURE_URL_PREFIX = 'https://ain93-fixture.invalid/';

export function fixtureSourceUrl(key: SeedListingKey): string {
  return `${FIXTURE_URL_PREFIX}${key}`;
}

export interface SeedFloorPlanTruth {
  readonly name: string;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly rent_min: number | null;
  readonly rent_max: number | null;
  readonly sqft: number | null;
  readonly availability: string | null;
}

export interface SeedListingTruth {
  readonly key: SeedListingKey;
  readonly nickname: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly sourceSite: string;
  readonly address: string;
  readonly rent: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly amenities: readonly string[];
  readonly status: 'active' | 'archived';
  readonly description: string;
  /** Only set on the `building` row (AIN-83 deep-extract shape). */
  readonly floorPlans?: readonly SeedFloorPlanTruth[];
  readonly priceIsFrom?: boolean;
}

const BUILDING_FLOOR_PLANS: readonly SeedFloorPlanTruth[] = [
  {
    name: 'Studio',
    bedrooms: 0,
    bathrooms: 1,
    rent_min: 1050,
    rent_max: 1050,
    sqft: 410,
    availability: 'Available now',
  },
  {
    name: '1 Bed 1 Bath',
    bedrooms: 1,
    bathrooms: 1,
    rent_min: 1300,
    rent_max: 1350,
    sqft: 620,
    availability: 'Fall 2026',
  },
  {
    name: '2 Bed 2 Bath',
    bedrooms: 2,
    bathrooms: 2,
    rent_min: 1800,
    rent_max: 1900,
    sqft: 1020,
    availability: '2 left',
  },
  {
    name: '3 Bed 2 Bath',
    bedrooms: 3,
    bathrooms: 2,
    rent_min: 2400,
    rent_max: 2500,
    sqft: 1350,
    availability: 'Waitlist',
  },
];

// The building row's top-level fields mirror the cheapest plan (index 0 —
// BUILDING_FLOOR_PLANS is authored cheapest-first, matching the real
// extractZillowFloorPlans sort order).
const CHEAPEST_BUILDING_PLAN = BUILDING_FLOOR_PLANS[0]!;

/** The fixed 8-row truth table, keyed for stable scenario references. */
export const SEED_LISTINGS: Readonly<Record<SeedListingKey, SeedListingTruth>> = {
  studio: {
    key: 'studio',
    nickname: '[AIN-93] The Compact Studio',
    title: 'Studio Apartment - 214 State St',
    sourceUrl: fixtureSourceUrl('studio'),
    sourceSite: 'ain93-fixture',
    address: '214 State St, Madison, WI 53703',
    rent: 950,
    bedrooms: 0,
    bathrooms: 1,
    sqft: 400,
    amenities: ['laundry_on_site'],
    status: 'active',
    description: 'A small studio a few blocks from campus. Basic laundry on site.',
  },
  onebed: {
    key: 'onebed',
    nickname: '[AIN-93] Cozy One-Bedroom',
    title: '1BR - 512 University Ave',
    sourceUrl: fixtureSourceUrl('onebed'),
    sourceSite: 'ain93-fixture',
    address: '512 University Ave, Madison, WI 53703',
    rent: 1150,
    bedrooms: 1,
    bathrooms: 1,
    sqft: 600,
    amenities: ['laundry_on_site', 'dishwasher'],
    status: 'active',
    description: 'Affordable one-bedroom near the bus line.',
  },
  twobed_basic: {
    key: 'twobed_basic',
    nickname: '[AIN-93] Dayton Street Duplex',
    title: '2BR - 523 W Dayton St',
    sourceUrl: fixtureSourceUrl('twobed_basic'),
    sourceSite: 'ain93-fixture',
    address: '523 W Dayton St, Madison, WI 53703',
    rent: 1650,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 900,
    amenities: ['parking', 'laundry_on_site'],
    status: 'active',
    description: 'Half of a duplex, walkable to State St.',
  },
  twobed_nice: {
    key: 'twobed_nice',
    nickname: '[AIN-93] The Regent Flats',
    title: '2BR/2BA - 1102 Regent St',
    sourceUrl: fixtureSourceUrl('twobed_nice'),
    sourceSite: 'ain93-fixture',
    address: '1102 Regent St, Madison, WI 53715',
    rent: 1950,
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1050,
    amenities: ['in_unit_laundry', 'gym', 'air_conditioning', 'dishwasher'],
    status: 'active',
    description: 'Newer building with a fitness room and in-unit laundry.',
  },
  threebed: {
    key: 'threebed',
    nickname: '[AIN-93] Langdon House',
    title: '3BR House - 630 Langdon St',
    sourceUrl: fixtureSourceUrl('threebed'),
    sourceSite: 'ain93-fixture',
    address: '630 Langdon St, Madison, WI 53703',
    rent: 2700,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1400,
    amenities: ['yard', 'parking'],
    status: 'active',
    description: 'Group house near the lake, small yard, off-street parking.',
  },
  fourbed: {
    key: 'fourbed',
    nickname: '[AIN-93] Mifflin Street 4BR',
    title: '4BR - 418 Mifflin St',
    sourceUrl: fixtureSourceUrl('fourbed'),
    sourceSite: 'ain93-fixture',
    address: '418 Mifflin St, Madison, WI 53703',
    rent: 3400,
    bedrooms: 4,
    bathrooms: 2,
    sqft: 1800,
    amenities: ['dishwasher', 'in_unit_laundry', 'parking'],
    status: 'active',
    description: 'Large group house, split among 4, close to the Kohl Center.',
  },
  building: {
    key: 'building',
    nickname: '[AIN-93] EO Madison Yards',
    title: 'EO Madison Yards - 2 E Mifflin St',
    sourceUrl: fixtureSourceUrl('building'),
    sourceSite: 'ain93-fixture',
    address: '2 E Mifflin St, Madison, WI 53703',
    // AIN-83: top-level fields mirror the cheapest floor plan, not a
    // single-unit price. `priceIsFrom: true` marks this as a "from $X" figure.
    rent: CHEAPEST_BUILDING_PLAN.rent_min,
    bedrooms: CHEAPEST_BUILDING_PLAN.bedrooms,
    bathrooms: CHEAPEST_BUILDING_PLAN.bathrooms,
    sqft: CHEAPEST_BUILDING_PLAN.sqft,
    amenities: ['gym', 'package_room', 'elevator'],
    status: 'active',
    description: 'Large new-construction building downtown with a full floor-plan lineup.',
    floorPlans: BUILDING_FLOOR_PLANS,
    priceIsFrom: true,
  },
  archived: {
    key: 'archived',
    nickname: '[AIN-93] Old Apartment (moved out)',
    title: '2BR - 4 old apartment',
    sourceUrl: fixtureSourceUrl('archived'),
    sourceSite: 'ain93-fixture',
    address: '77 W Gilman St, Madison, WI 53703',
    rent: 1400,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 750,
    amenities: ['laundry_on_site'],
    // MUST NEVER appear in an answer — this is the archived-row-exclusion check.
    status: 'archived',
    description: 'Archived — no longer relevant, must be excluded from answers.',
  },
} as const;

export function seedListingsList(): readonly SeedListingTruth[] {
  return SEED_LISTING_KEYS.map((key) => SEED_LISTINGS[key]);
}

/**
 * Build the `raw_extraction` JSONB value for a truth row. Mirrors
 * `buildRawExtraction` in `crm/add-listing.ts` — only the `building` row
 * carries a `deep_extract` subtree.
 */
function toRawExtraction(truth: SeedListingTruth): Record<string, unknown> {
  const base: Record<string, unknown> = {
    raw_json_ld: null,
    raw_og: null,
    extraction_method: 'json_ld',
  };
  if (truth.floorPlans && truth.floorPlans.length > 0) {
    base['deep_extract'] = {
      floor_plans: truth.floorPlans,
      price_is_from: truth.priceIsFrom ?? false,
      method: 'ingest_v1',
    };
  }
  return base;
}

/** Build the `crm_listings` insert row for one truth entry, owned by `userId`. */
export function toInsertRow(userId: string, truth: SeedListingTruth): Record<string, unknown> {
  return {
    user_id: userId,
    source_url: truth.sourceUrl,
    source_site: truth.sourceSite,
    title: truth.title,
    nickname: truth.nickname,
    address: truth.address,
    rent: truth.rent,
    bedrooms: truth.bedrooms,
    bathrooms: truth.bathrooms,
    sqft: truth.sqft,
    amenities: truth.amenities,
    description: truth.description,
    status: truth.status,
    extraction_confidence: 0.9,
    raw_extraction: toRawExtraction(truth),
  };
}

/** Build all 8 insert rows for `userId`, in the fixed `SEED_LISTING_KEYS` order. */
export function buildSeedInsertRows(userId: string): readonly Record<string, unknown>[] {
  return seedListingsList().map((truth) => toInsertRow(userId, truth));
}
