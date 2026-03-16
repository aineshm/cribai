import type { ExploreListing } from './listing-types';

/** Structured filter state with actual values, not just toggles. */
export interface FilterValues {
  readonly sublease: boolean;
  readonly priceMax: number | null;
  readonly bedsMin: number | null;
  readonly petFriendly: boolean;
  readonly furnished: boolean;
}

export const DEFAULT_FILTERS: FilterValues = {
  sublease: false,
  priceMax: null,
  bedsMin: null,
  petFriendly: false,
  furnished: false,
};

/** Check if any filter is active. */
export function hasActiveFilters(filters: FilterValues): boolean {
  return (
    filters.sublease ||
    filters.priceMax !== null ||
    filters.bedsMin !== null ||
    filters.petFriendly ||
    filters.furnished
  );
}

/** Count how many filters are active. */
export function activeFilterCount(filters: FilterValues): number {
  let count = 0;
  if (filters.sublease) count++;
  if (filters.priceMax !== null) count++;
  if (filters.bedsMin !== null) count++;
  if (filters.petFriendly) count++;
  if (filters.furnished) count++;
  return count;
}

// Legacy type alias for backwards compatibility with tests
export type ActiveFilters = ReadonlySet<string>;

/**
 * Filter listings based on structured filter values.
 * Each active filter narrows the result set (AND logic).
 * Also accepts legacy Set-based filters for test backwards compatibility.
 */
export function filterListings(
  listings: readonly ExploreListing[],
  filters: FilterValues | ActiveFilters,
): readonly ExploreListing[] {
  // Support legacy Set-based filters for backwards compatibility
  if (filters instanceof Set) {
    return filterListingsLegacy(listings, filters as ActiveFilters);
  }

  const f = filters as FilterValues;
  if (!hasActiveFilters(f)) return listings;

  return listings.filter((listing) => {
    if (f.sublease && listing.source !== 'sublease') return false;
    if (f.priceMax !== null && listing.price > f.priceMax) return false;
    if (f.bedsMin !== null) {
      if (listing.beds === null) return false;
      // Studio filter (bedsMin=0): only show 0-bed (studio) listings
      if (f.bedsMin === 0) {
        if (listing.beds !== 0) return false;
      } else {
        if (listing.beds < f.bedsMin) return false;
      }
    }
    if (f.petFriendly) {
      const hasPets = listing.amenities.some(
        (a) => a.toLowerCase().includes('cat') || a.toLowerCase().includes('dog') || a.toLowerCase().includes('pet')
      );
      if (!hasPets) return false;
    }
    if (f.furnished) {
      const isFurnished = listing.amenities.some((a) => a.toLowerCase().includes('furnished'));
      if (!isFurnished) return false;
    }
    return true;
  });
}

/** Legacy filter function for backwards compatibility with existing tests. */
function filterListingsLegacy(
  listings: readonly ExploreListing[],
  activeFilters: ActiveFilters,
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
    case 'sublease':
      return listing.source === 'sublease';
    case 'price':
      return listing.price <= 1500;
    case 'beds':
      return (listing.beds ?? 0) >= 2;
    case 'distance':
      return (listing.walkScore ?? 0) >= 80;
    case 'move-in':
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
