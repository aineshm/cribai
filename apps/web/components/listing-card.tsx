import Link from 'next/link';

interface ListingCardProps {
  readonly listing: {
    readonly id: string;
    readonly address: string;
    readonly rent_monthly: number;
    readonly bedrooms: number | null;
    readonly bathrooms: number | null;
    readonly sqft: number | null;
    readonly fairness_score: number | null;
    readonly true_cost_total: number | null;
    readonly amenities: readonly string[];
  };
  readonly campusSlug: string;
}

function fairnessColor(score: number): string {
  if (score >= 7) return 'bg-[var(--fair-good-bg)] text-[var(--fair-good)]';
  if (score >= 4) return 'bg-[var(--fair-ok-bg)] text-[var(--fair-ok)]';
  return 'bg-[var(--fair-bad-bg)] text-[var(--fair-bad)]';
}

export function ListingCard({ listing, campusSlug }: ListingCardProps) {
  return (
    <Link
      href={`/${campusSlug}/listings/${listing.id}`}
      className="block rounded-xl bg-white p-5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--surface-900)] line-clamp-1">
            {listing.address}
          </h3>
          <p className="mt-1 text-2xl font-bold text-[var(--surface-900)]">
            ${listing.rent_monthly.toLocaleString()}
            <span className="text-sm font-normal text-[var(--surface-400)]">/mo</span>
          </p>
        </div>
        {listing.fairness_score != null && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${fairnessColor(listing.fairness_score)}`}
          >
            {listing.fairness_score}/10
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-3 text-sm text-[var(--surface-500)]">
        {listing.bedrooms != null && <span>{listing.bedrooms} bed</span>}
        {listing.bathrooms != null && <span>{listing.bathrooms} bath</span>}
        {listing.sqft != null && (
          <span>{listing.sqft.toLocaleString()} sqft</span>
        )}
      </div>

      {listing.true_cost_total != null && (
        <p className="mt-2 text-sm text-[var(--surface-400)]">
          True Cost:{' '}
          <span className="font-medium text-[var(--primary-700)]">
            ${listing.true_cost_total.toLocaleString()}/mo
          </span>
        </p>
      )}
    </Link>
  );
}
