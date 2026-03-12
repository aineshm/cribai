import type { Listing } from './mock-listings';

export type ActiveFilters = ReadonlySet<string>;

/** Price threshold for "budget-friendly" filtering */
const PRICE_THRESHOLD = 1500;

/** Distance threshold in miles */
const DISTANCE_THRESHOLD = 0.5;

/**
 * Filter listings based on active filter chip selections.
 * Each active filter narrows the result set (AND logic).
 */
export function filterListings(
  listings: readonly Listing[],
  activeFilters: ActiveFilters
): readonly Listing[] {
  if (activeFilters.size === 0) return listings;

  return listings.filter((listing) => {
    for (const filterId of activeFilters) {
      if (!matchesFilter(listing, filterId)) return false;
    }
    return true;
  });
}

function matchesFilter(listing: Listing, filterId: string): boolean {
  switch (filterId) {
    case 'price':
      return listing.price <= PRICE_THRESHOLD;
    case 'beds':
      return listing.beds >= 2;
    case 'distance':
      return listing.distanceToCampus <= DISTANCE_THRESHOLD;
    case 'move-in':
      // All mock listings are available — passes by default
      return true;
    case 'pets':
      return listing.amenities.includes('Pet Friendly');
    case 'furnished':
      return listing.amenities.includes('Furnished');
    default:
      return true;
  }
}
