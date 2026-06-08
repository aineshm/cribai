/**
 * Pure amenity-to-cost-flag mapper for the CRM workflows (AIN-15).
 *
 * Converts a raw amenity string array (as stored in crm_listings.amenities)
 * into a Partial<TrueCostInput> so the caller can pass it directly to
 * calculateTrueCost. Only flags that are PRESENT are set; absent flags are
 * omitted so calculateTrueCost can apply its own defaults.
 *
 * Matching strategy: lowercase + substring, mirroring the approach used in
 * packages/utils/src/fairness-scorer.ts lines ~88-92 (hasParking / hasLaundry
 * checks). No regex — kept simple and fast.
 *
 * FIX 2 guards:
 *   - Negation / extra-cost guard: before setting any included-flag for a matched
 *     keyword, the SAME amenity string is checked for negation or extra-cost markers.
 *     If any marker is found the flag is NOT set.
 *   - Laundry tightened: only strings with in-unit indicators (in-unit, in unit,
 *     in-suite, washer, dryer) set hasInUnitLaundry. Bare 'laundry', 'shared
 *     laundry', and 'laundry hookups' (tenant supplies their own appliance) do not.
 *
 * No I/O. No side effects. Input array is never mutated.
 */

import type { TrueCostInput } from './types';

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Tokens that — when present in the SAME amenity string as a matched keyword —
 * indicate the amenity is NOT included (it's negated or costs extra).
 * Case-insensitive substring match.
 */
const EXTRA_COST_MARKERS = [
  'no ',         // "No parking"
  'not included',
  'extra',
  'additional',
  'surcharge',
  ' fee',
  '$',
  '/mo',
  'per month',
  'coin',
  'paid',
] as const;

/** Return true if the (already-lowercased) amenity string signals extra cost or negation. */
function hasExtraCostMarker(lower: string): boolean {
  return EXTRA_COST_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * In-unit laundry indicators: the amenity must contain at least one of these
 * substrings for hasInUnitLaundry to be set. Bare 'laundry' (shared facility)
 * and 'shared laundry' are deliberately excluded.
 */
const IN_UNIT_LAUNDRY_MARKERS = [
  'in-unit',
  'in unit',
  'in-suite',
  'washer',
  'dryer',
  // NOTE: 'hookup' is deliberately NOT a marker — a laundry hookup means the
  // unit has connections for the tenant's OWN washer/dryer, so laundry is NOT
  // an included amenity and its cost line must not be zeroed.
] as const;

/** Return true if the (already-lowercased) amenity string signals an in-unit laundry. */
function hasInUnitLaundryMarker(lower: string): boolean {
  return IN_UNIT_LAUNDRY_MARKERS.some((marker) => lower.includes(marker));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map a listing's amenities array to the subset of TrueCostInput boolean flags
 * that affect the true-cost calculation.
 *
 * @param amenities - The amenities array from crm_listings, ExtractedListing,
 *   or any other source. null / undefined are treated as "no amenities".
 * @returns A partial TrueCostInput containing only the flags that matched.
 */
export function amenitiesToCostFlags(
  amenities: readonly string[] | null | undefined,
): Partial<TrueCostInput> {
  if (!amenities || amenities.length === 0) return {};

  // Build a mutable accumulator — TrueCostInput has readonly fields, so we
  // collect flags here and freeze the shape at return time.
  let hasInUnitLaundry: true | undefined;
  let parkingIncluded: true | undefined;
  let internetIncluded: true | undefined;
  let utilitiesIncluded: true | undefined;

  for (const amenity of amenities) {
    const lower = amenity.toLowerCase();

    // In-unit laundry: must have an in-unit indicator AND no extra-cost marker.
    if (lower.includes('laundry') || lower.includes('washer') || lower.includes('dryer')) {
      if (hasInUnitLaundryMarker(lower) && !hasExtraCostMarker(lower)) {
        hasInUnitLaundry = true;
      }
    }

    // Parking: must contain 'parking' AND no extra-cost/negation marker.
    if (lower.includes('parking') && !hasExtraCostMarker(lower)) {
      parkingIncluded = true;
    }

    // Internet / wifi: must have the keyword AND no extra-cost marker.
    if ((lower.includes('internet') || lower.includes('wifi')) && !hasExtraCostMarker(lower)) {
      internetIncluded = true;
    }

    // Utilities: must have an 'included' phrase AND no extra-cost/negation
    // marker — otherwise "No utilities included" or "heat included for $75/mo"
    // would wrongly zero out the utilities cost line in calculateTrueCost.
    if (
      (lower.includes('utilities included') ||
        lower.includes('heat included') ||
        lower.includes('water included')) &&
      !hasExtraCostMarker(lower)
    ) {
      utilitiesIncluded = true;
    }
  }

  const flags: Partial<TrueCostInput> = {
    ...(hasInUnitLaundry !== undefined && { hasInUnitLaundry }),
    ...(parkingIncluded !== undefined && { parkingIncluded }),
    ...(internetIncluded !== undefined && { internetIncluded }),
    ...(utilitiesIncluded !== undefined && { utilitiesIncluded }),
  };

  return flags;
}
