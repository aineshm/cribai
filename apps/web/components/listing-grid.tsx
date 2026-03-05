import { ListingCard } from './listing-card';

interface ListingGridProps {
  readonly listings: ReadonlyArray<{
    readonly id: string;
    readonly address: string;
    readonly rent_monthly: number;
    readonly bedrooms: number | null;
    readonly bathrooms: number | null;
    readonly sqft: number | null;
    readonly fairness_score: number | null;
    readonly true_cost_total: number | null;
    readonly amenities: readonly string[];
  }>;
  readonly campusSlug: string;
}

export function ListingGrid({ listings, campusSlug }: ListingGridProps) {
  if (listings.length === 0) {
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing, index) => (
        <div
          key={listing.id}
          className="stagger-item"
          style={{ '--stagger-index': index } as React.CSSProperties}
        >
          <ListingCard listing={listing} campusSlug={campusSlug} />
        </div>
      ))}
    </div>
  );
}
