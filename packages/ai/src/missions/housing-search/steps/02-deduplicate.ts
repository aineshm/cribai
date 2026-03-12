import type { MissionStep, StepContext, StepResult } from '../../types';
import type { ListingSummary } from '@campusnest/types';

/**
 * Deduplicate listings by normalised address (lowercase + trimmed).
 * When duplicates exist, keep the listing with the lowest rent.
 * Exported for unit testing.
 */
export function deduplicateListings(listings: ListingSummary[]): ListingSummary[] {
  const seen = new Map<string, ListingSummary>();
  for (const listing of listings) {
    const key = listing.address.toLowerCase().trim();
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, listing);
    } else {
      const existingRent = existing.rentMonthly ?? Infinity;
      const newRent = listing.rentMonthly ?? Infinity;
      if (newRent < existingRent) seen.set(key, listing);
    }
  }
  return Array.from(seen.values());
}

/**
 * Clamp topN to the actual number of available listings.
 * Exported for unit testing.
 */
export function clampTopN(listingCount: number, topN: number): number {
  return Math.min(topN, listingCount);
}

export const deduplicateStep: MissionStep = {
  id: 'deduplicate',
  label: 'Filtering results',

  async run(ctx: StepContext): Promise<StepResult> {
    const rawListings = (ctx.state.rawListings ?? []) as ListingSummary[];
    const inputTopN = (ctx.input as { topN?: number }).topN ?? 5;

    const listings = deduplicateListings(rawListings);
    const topN = clampTopN(listings.length, inputTopN);

    return {
      output: { listings, topN },
    };
  },
};
