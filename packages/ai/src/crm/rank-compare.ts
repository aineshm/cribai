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

import { SCORING_FEATURES } from './scoring-features';
import type { ScoringFeature } from './scoring-features';
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
 * Canonical scoring features imported from the single source of truth.
 * Use SCORING_FEATURES everywhere instead of a local literal to prevent drift.
 */
const SUPPORTED_FEATURES = SCORING_FEATURES;
type Feature = ScoringFeature;

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
  // Use .maybeSingle() (not .single()) so a zero-row result yields
  // {data:null, error:null} cleanly instead of throwing PGRST116.
  // A genuine DB error is surfaced via the error field and re-thrown.
  const profileResult = await (db
    .from('crm_inferred_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle() as unknown as Promise<{ data: InferredProfile | null; error: unknown }>);

  const { data: profileData, error: profileError } = profileResult;

  if (profileError) {
    throw new Error(`rankCompare: failed to fetch inferred profile — ${String(profileError)}`);
  }

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
 * Missing numeric values score 0 (worst) directly — never normalized — so a
 * null-rent listing is not inverted into a perfect score, and missing values
 * are excluded from the min/max range (see computeMinMax).
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

  // Missing numeric value → worst score (0) for EVERY feature, including the
  // inverted rent feature. Returning 0 here (rather than letting `?? 0` flow
  // through normalization) prevents a null-rent listing from inverting to a
  // perfect 1.0 ("treated as free") and keeps "missing = worst" uniform.
  if (rawValue === null) {
    return 0;
  }

  const normalized = minMaxNormalize(rawValue, range.min, range.max);

  // Lower rent is better → invert.
  if (feature === 'rent') {
    return 1 - normalized;
  }

  return normalized;
}

/** Extract the raw numeric value for a feature from a row; null/undefined → null (missing). */
function resolveNumericField(feature: Feature, row: CrmListingRow): number | null {
  switch (feature) {
    case 'rent':
      return row.rent ?? null;
    case 'bedrooms':
      return row.bedrooms ?? null;
    case 'sqft':
      return row.sqft ?? null;
    case 'commute':
      return null; // unused path; handled above
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

  // Only fold in rows that actually HAVE a value for the feature — a missing
  // (null) value must not drag the min/max (e.g. a null rent pinning rent.min
  // to 0 and distorting every other row's normalization). Missing values are
  // scored as worst (0) directly in computeSubScore, never normalized here.
  for (const row of rows) {
    if (row.rent != null) {
      acc.rent.min = Math.min(acc.rent.min, row.rent);
      acc.rent.max = Math.max(acc.rent.max, row.rent);
    }
    if (row.bedrooms != null) {
      acc.bedrooms.min = Math.min(acc.bedrooms.min, row.bedrooms);
      acc.bedrooms.max = Math.max(acc.bedrooms.max, row.bedrooms);
    }
    if (row.sqft != null) {
      acc.sqft.min = Math.min(acc.sqft.min, row.sqft);
      acc.sqft.max = Math.max(acc.sqft.max, row.sqft);
    }
  }

  // A feature with NO non-null values across the set leaves its range at
  // ±Infinity; normalize it to a neutral 0-range. Rows are all-missing for that
  // feature in that case, so they score 0 via computeSubScore and this range is
  // never actually consumed — but keep it finite for safety.
  for (const feature of ['rent', 'bedrooms', 'sqft'] as const) {
    if (!Number.isFinite(acc[feature].min)) {
      acc[feature] = { min: 0, max: 0 };
    }
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
 * Synonym map for LLM weight-key drift tolerance.
 *
 * When Gemini emits a stale or variant key, we map it onto the canonical key
 * so resolveWeights doesn't silently zero out the weight. Synonyms are only
 * applied when the canonical key is NOT already present in profileWeights.
 *
 * Canonical key → synonyms to remap to it:
 *   rent     ← price
 *   sqft     ← space
 *   commute  ← location
 *   bedrooms ← bedroom, beds
 */
const WEIGHT_SYNONYMS: Readonly<Record<string, Feature>> = {
  price: 'rent',
  space: 'sqft',
  location: 'commute',
  bedroom: 'bedrooms',
  beds: 'bedrooms',
};

/**
 * Apply synonym remapping to a raw weights map.
 * Returns a new object — does not mutate the input.
 * Only maps a synonym key if the canonical target is absent from the input.
 */
function applyWeightSynonyms(
  weights: Readonly<Record<string, number>>,
): Record<string, number> {
  const result: Record<string, number> = { ...weights };
  for (const [synonym, canonical] of Object.entries(WEIGHT_SYNONYMS)) {
    if (synonym in result && !(canonical in result)) {
      result[canonical] = result[synonym]!;
      // Remove the synonym key so it doesn't accumulate as an unknown key.
      delete result[synonym];
    }
  }
  return result;
}

/**
 * Resolve the feature weights to use for scoring.
 *
 * Priority:
 *   1. profile.weights (jsonb map keyed by feature name), after synonym remapping
 *   2. Equal weights (1 / featureCount per feature)
 *
 * In both cases weights are normalized so they sum exactly to 1.
 * Unknown keys in profile.weights are silently ignored so the scorer
 * isn't affected by future profile fields.
 *
 * Synonym tolerance: common LLM-drift keys are remapped before reading so
 * a profile with `{price:0.6, space:0.4}` degrades gracefully to
 * `{rent:0.6, sqft:0.4}` rather than producing all-zero matched weights.
 * Mapping: price→rent, space→sqft, location→commute, bedroom/beds→bedrooms.
 * Only applied when the canonical key is absent (no double-counting).
 */
function resolveWeights(
  profile: InferredProfile | null,
): Readonly<Record<Feature, number>> {
  const rawProfileWeights = profile?.weights;

  let raw: Record<Feature, number>;

  if (rawProfileWeights && Object.keys(rawProfileWeights).length > 0) {
    // Apply synonym tolerance before reading canonical keys.
    const profileWeights = applyWeightSynonyms(rawProfileWeights);
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
    // FIX 6: Deduplicate IDs preserving first occurrence to avoid duplicate rows.
    const seenIds = new Set<string>();
    const uniqueIds = listingIds.filter((id) => {
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    // listingIds takes precedence over listingTitles.
    matchedRows = uniqueIds
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is CrmListingRow => r !== undefined);
  } else if (listingTitles && listingTitles.length > 0) {
    // FIX 6: Skip empty/whitespace-only requested titles before matching.
    // FIX 6: Deduplicate titles preserving first occurrence.
    // FIX 6: Do NOT match a requested title against a row whose title is null/empty
    //         (guard: '' never matches a null-titled row).
    const seenTitles = new Set<string>();
    const uniqueTitles = listingTitles.filter((t) => {
      if (t.trim() === '') return false; // skip empty/whitespace-only
      if (seenTitles.has(t.toLowerCase())) return false; // deduplicate case-insensitively
      seenTitles.add(t.toLowerCase());
      return true;
    });

    // Case-insensitive title match; preserve requested order; unknown titles omitted.
    matchedRows = uniqueTitles
      .map((title) =>
        rows.find((r) => {
          const rowTitle = r.title ?? '';
          // Guard: skip rows with null/empty title so '' never spuriously matches.
          if (rowTitle === '') return false;
          return rowTitle.toLowerCase() === title.toLowerCase();
        }),
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
