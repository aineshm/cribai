import type { ExploreListing } from './listing-types';

export type ActiveFilters = ReadonlySet<string>;

/** Price threshold for "budget-friendly" filtering */
const PRICE_THRESHOLD = 1500;

/**
 * Filter listings based on active filter chip selections.
 * Each active filter narrows the result set (AND logic).
 */
export function filterListings(
  listings: readonly ExploreListing[],
  activeFilters: ActiveFilters
): readonly ExploreListing[] {
  if (activeFilters.size === 0) return listings;

  return listings.filter((listing) => {
    for (const filterId of activeFilters) {
      if (!matchesFilter(listing, filterId)) return false;
    }
    return true;
  });
}

function matchesFilter(listing: ExploreListing, filterId: string): boolean {
  switch (filterId) {
    case 'price':
      return listing.price <= PRICE_THRESHOLD;
    case 'beds':
      return (listing.beds ?? 0) >= 2;
    case 'distance':
      // Walk Score ≥ 80 is a proxy for "close to campus"
      return (listing.walkScore ?? 0) >= 80;
    case 'move-in':
      // Has an available date set
      return listing.availableDate !== null;
    case 'pets':
      return listing.amenities.some(
        (a) => a.toLowerCase().includes('cat') || a.toLowerCase().includes('dog') || a.toLowerCase().includes('pet')
      );
    case 'furnished':
      return listing.amenities.some((a) => a.toLowerCase().includes('furnished'));
    default:
      return true;
  }
}
