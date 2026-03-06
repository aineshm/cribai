import { ListingCard } from './listing-card';
import { StaleSection } from './stale-section';

interface ListingData {
  readonly id: string;
  readonly address: string;
  readonly rent_monthly: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly fairness_score: number | null;
  readonly true_cost_total: number | null;
  readonly amenities: readonly string[];
  readonly photo_urls: readonly string[];
  readonly source_url: string | null;
  readonly last_seen_at: string | null;
  readonly is_active: boolean;
}

interface ListingGridProps {
  readonly listings: ReadonlyArray<ListingData>;
  readonly campusSlug: string;
}

export function ListingGrid({ listings, campusSlug }: ListingGridProps) {
  const activeListings = listings.filter((l) => l.is_active);
  const staleListings = listings.filter((l) => !l.is_active);

  if (activeListings.length === 0 && staleListings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
        <p className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-800)]">No listings found</p>
        <p className="mt-2 text-sm text-[var(--surface-400)]">
          Try adjusting your filters or check back later.
        </p>
      </div>
    );
  }

  return (
    <div>
      {activeListings.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeListings.map((listing, index) => (
            <div
              key={listing.id}
              className="stagger-item"
              style={{ '--stagger-index': index } as React.CSSProperties}
            >
              <ListingCard listing={listing} campusSlug={campusSlug} />
            </div>
          ))}
        </div>
      )}

      {staleListings.length > 0 && (
        <StaleSection listings={staleListings} campusSlug={campusSlug} />
      )}
    </div>
  );
}
