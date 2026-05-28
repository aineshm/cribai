/**
 * rankCompare — rank or side-by-side compare a user's saved CRM listings.
 *
 * PURE scoring over database-returned rows; no LLM, no external API calls.
 *
 * Fairness scoring (calculateFairnessScore / @campusnest/utils) is DEFERRED
 * to v2. Phase 1 has no per-user comp set, so per-PDR-003 the field is absent
 * from all output shapes. Do not add it here without a spec amendment.
 *
 * Commute approximation (Phase 1 caveat):
 *   crm_inferred_profiles stores `home_base_address` (text) but no geocoded
 *   lat/lng. The DB schema (migration 037) does not have home_base_latitude /
 *   home_base_longitude columns. Since geocoding is forbidden in this pure
 *   module, straight-line distance to home base is UNAVAILABLE in Phase 1.
 *   All listings receive a neutral commuteScore of 0.5 regardless of their
 *   coordinates. This means the commute weight effectively averages out and
 *   does not influence relative ordering. Phase 2 can resolve this by either:
 *     (a) adding geocoded home_base columns to crm_inferred_profiles, or
 *     (b) accepting a pre-computed commuteMinutes map as a dep argument.
 *
 * Queried tables (via deps.db):
 *   'crm_listings'          — active listings for the user
 *   'crm_inferred_profiles' — single profile row (may be absent)
 */

import type {
  RankCompareDeps,
  RankCompareArgs,
  RankCompareResult,
  RankedListing,
  CompareRow,
  CrmListingRow,
  InferredProfile,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The four scoring features supported in Phase 1.
 * Extend this tuple when adding new dimensions (e.g. 'amenities' in v2).
 */
const SUPPORTED_FEATURES = ['rent', 'bedrooms', 'sqft', 'commute'] as const;
type Feature = (typeof SUPPORTED_FEATURES)[number];

/** Neutral commute sub-score used when home-base coords are unavailable (Phase 1). */
const COMMUTE_NEUTRAL = 0.5;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Rank or compare the user's saved CRM listings.
 *
 * @param args  - Controls mode ('rank' | 'compare') and optional selectors.
 * @param deps  - Injected db client + userId (no LLM, no network).
 */
export async function rankCompare(
  args: RankCompareArgs,
  deps: RankCompareDeps,
): Promise<RankCompareResult> {
  const { db, userId } = deps;
  const mode = args.mode ?? 'rank';

  // --- 1. Fetch active listings ---
  // Cast through unknown to satisfy TypeScript: the supabase-js builder is
  // thenable and resolves to { data, error } but its declared return type is
  // a PostgrestFilterBuilder that TypeScript doesn't overlap with Promise<…>
  // for a direct `as` cast. Casting through `unknown` first is the standard
  // pattern used across the codebase when the caller wants a typed result shape.
  // Phase 2 commute scoring needs ST_Y(coordinates)/ST_X(coordinates) projected via an RPC;
  // Phase 1 commute is neutral so coords aren't selected.
  const listingsResult = await (db
    .from('crm_listings')
    .select('id, title, rent, bedrooms, bathrooms, sqft, amenities, status')
    .eq('user_id', userId) as unknown as Promise<{ data: CrmListingRow[] | null; error: unknown }>);

  const { data: rawRows, error: listingsError } = listingsResult;

  if (listingsError) {
    throw new Error(`rankCompare: failed to fetch listings — ${String(listingsError)}`);
  }

  // Filter to active only (defensive — the SQL .eq would also filter in prod).
  const activeRows: readonly CrmListingRow[] = (rawRows ?? []).filter(
    (r) => r.status === 'active',
  );

  // --- 2. Fetch inferred profile (optional) ---
  const profileResult = await (db
    .from('crm_inferred_profiles')
    .select('*')
    .eq('user_id', userId)
    .single() as unknown as Promise<{ data: InferredProfile | null; error: unknown }>);

  const { data: profileData } = profileResult;

  const profile: InferredProfile | null = profileData ?? null;

  // --- 3. Dispatch to mode handler ---
  if (mode === 'compare') {
    return buildCompareResult(activeRows, args);
  }

  return buildRankResult(activeRows, profile);
}

// ---------------------------------------------------------------------------
// RANK mode
// ---------------------------------------------------------------------------

function buildRankResult(
  rows: readonly CrmListingRow[],
  profile: InferredProfile | null,
): RankCompareResult {
  const weights = resolveWeights(profile);
  const minMax = computeMinMax(rows);

  const ranked: readonly RankedListing[] = [...rows]
    .map((row) => scoreRow(row, weights, minMax))
    .sort((a, b) => b.score - a.score);

  return { mode: 'rank', ranked };
}

/** Score a single row, producing a RankedListing. */
function scoreRow(
  row: CrmListingRow,
  weights: Readonly<Record<Feature, number>>,
  minMax: Readonly<Record<Feature, { min: number; max: number }>>,
): RankedListing {
  const breakdown: Record<string, number> = {};
  let totalScore = 0;

  for (const feature of SUPPORTED_FEATURES) {
    const w = weights[feature];
    const subScore = computeSubScore(feature, row, minMax[feature]);
    breakdown[feature] = subScore;
    totalScore += w * subScore;
  }

  return {
    listingId: row.id,
    title: row.title ?? '',
    score: totalScore,
    breakdown,
  };
}

/**
 * Compute the normalized sub-score for a single feature on a single row.
 * Returns a value in [0, 1].
 *
 * Rent uses inverted normalization: lower rent = higher score.
 * Missing numeric values are treated as 0 (worst) before normalization.
 * Commute always returns COMMUTE_NEUTRAL (0.5) in Phase 1 — see file header.
 */
function computeSubScore(
  feature: Feature,
  row: CrmListingRow,
  range: { min: number; max: number },
): number {
  if (feature === 'commute') {
    return COMMUTE_NEUTRAL;
  }

  const rawValue = resolveNumericField(feature, row);
  const normalized = minMaxNormalize(rawValue, range.min, range.max);

  // Lower rent is better → invert.
  if (feature === 'rent') {
    return 1 - normalized;
  }

  return normalized;
}

/** Extract the raw numeric value for a feature from a row; null/undefined → 0. */
function resolveNumericField(feature: Feature, row: CrmListingRow): number {
  switch (feature) {
    case 'rent':
      return row.rent ?? 0;
    case 'bedrooms':
      return row.bedrooms ?? 0;
    case 'sqft':
      return row.sqft ?? 0;
    case 'commute':
      return 0; // unused path; handled above
  }
}

/**
 * Min-max normalize a value to [0, 1].
 * When min === max (single listing or all identical), return 0.5 (neutral).
 */
function minMaxNormalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

/** Compute min/max for each supported feature across the row set. */
function computeMinMax(
  rows: readonly CrmListingRow[],
): Readonly<Record<Feature, { min: number; max: number }>> {
  const acc: Record<Feature, { min: number; max: number }> = {
    rent: { min: Infinity, max: -Infinity },
    bedrooms: { min: Infinity, max: -Infinity },
    sqft: { min: Infinity, max: -Infinity },
    commute: { min: 0, max: 0 }, // unused in Phase 1
  };

  for (const row of rows) {
    const rentVal = row.rent ?? 0;
    acc.rent.min = Math.min(acc.rent.min, rentVal);
    acc.rent.max = Math.max(acc.rent.max, rentVal);

    const bedVal = row.bedrooms ?? 0;
    acc.bedrooms.min = Math.min(acc.bedrooms.min, bedVal);
    acc.bedrooms.max = Math.max(acc.bedrooms.max, bedVal);

    const sqftVal = row.sqft ?? 0;
    acc.sqft.min = Math.min(acc.sqft.min, sqftVal);
    acc.sqft.max = Math.max(acc.sqft.max, sqftVal);
  }

  // Guard against empty rows (min/max stuck at ±Infinity).
  if (rows.length === 0) {
    return {
      rent: { min: 0, max: 0 },
      bedrooms: { min: 0, max: 0 },
      sqft: { min: 0, max: 0 },
      commute: { min: 0, max: 0 },
    };
  }

  return acc;
}

// ---------------------------------------------------------------------------
// Weight resolution + normalization
// ---------------------------------------------------------------------------

/**
 * Resolve the feature weights to use for scoring.
 *
 * Priority:
 *   1. profile.weights (jsonb map keyed by feature name)
 *   2. Equal weights (1 / featureCount per feature)
 *
 * In both cases weights are normalized so they sum exactly to 1.
 * Unknown keys in profile.weights are silently ignored so the scorer
 * isn't affected by future profile fields.
 */
function resolveWeights(
  profile: InferredProfile | null,
): Readonly<Record<Feature, number>> {
  const profileWeights = profile?.weights;

  let raw: Record<Feature, number>;

  if (profileWeights && Object.keys(profileWeights).length > 0) {
    // Extract only the supported features; default to 0 for absent ones.
    raw = {
      rent: profileWeights['rent'] ?? 0,
      bedrooms: profileWeights['bedrooms'] ?? 0,
      sqft: profileWeights['sqft'] ?? 0,
      commute: profileWeights['commute'] ?? 0,
    };
  } else {
    // Equal-weight fallback.
    const equalWeight = 1 / SUPPORTED_FEATURES.length;
    raw = {
      rent: equalWeight,
      bedrooms: equalWeight,
      sqft: equalWeight,
      commute: equalWeight,
    };
  }

  return normalizeWeights(raw);
}

/** Normalize a weight map so its values sum to 1. If sum is 0, fall back to equal weights. */
function normalizeWeights(
  weights: Record<Feature, number>,
): Readonly<Record<Feature, number>> {
  const total = SUPPORTED_FEATURES.reduce((sum, f) => sum + weights[f], 0);
  if (total === 0) {
    const equalWeight = 1 / SUPPORTED_FEATURES.length;
    return { rent: equalWeight, bedrooms: equalWeight, sqft: equalWeight, commute: equalWeight };
  }
  return {
    rent: weights.rent / total,
    bedrooms: weights.bedrooms / total,
    sqft: weights.sqft / total,
    commute: weights.commute / total,
  };
}

// ---------------------------------------------------------------------------
// COMPARE mode
// ---------------------------------------------------------------------------

function buildCompareResult(
  rows: readonly CrmListingRow[],
  args: RankCompareArgs,
): RankCompareResult {
  const { listingIds, listingTitles } = args;

  let matchedRows: readonly CrmListingRow[];

  if (listingIds && listingIds.length > 0) {
    // listingIds takes precedence over listingTitles.
    matchedRows = listingIds
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is CrmListingRow => r !== undefined);
  } else if (listingTitles && listingTitles.length > 0) {
    // Case-insensitive title match; preserve requested order; unknown titles omitted.
    matchedRows = listingTitles
      .map((title) =>
        rows.find((r) => (r.title ?? '').toLowerCase() === title.toLowerCase()),
      )
      .filter((r): r is CrmListingRow => r !== undefined);
  } else {
    // No selectors → return all active listings.
    matchedRows = rows;
  }

  const compareRows: readonly CompareRow[] = matchedRows.map((r) => ({
    listingId: r.id,
    title: r.title ?? '',
    rent: r.rent,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    sqft: r.sqft,
    amenities: r.amenities ?? [],
  }));

  return { mode: 'compare', rows: compareRows };
}
