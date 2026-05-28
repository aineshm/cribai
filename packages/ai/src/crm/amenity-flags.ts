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
 * No I/O. No side effects. Input array is never mutated.
 */

import type { TrueCostInput } from './types';

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

    if (lower.includes('laundry')) {
      hasInUnitLaundry = true;
    }

    if (lower.includes('parking')) {
      parkingIncluded = true;
    }

    if (lower.includes('internet') || lower.includes('wifi')) {
      internetIncluded = true;
    }

    if (
      lower.includes('utilities included') ||
      lower.includes('heat included') ||
      lower.includes('water included')
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
