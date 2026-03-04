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
  if (score >= 7) return 'bg-green-100 text-green-800';
  if (score >= 4) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

export function ListingCard({ listing, campusSlug }: ListingCardProps) {
  return (
    <Link
      href={`/${campusSlug}/listings/${listing.id}`}
      className="block rounded-lg border border-gray-200 p-5 hover:border-blue-300 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 line-clamp-1">
            {listing.address}
          </h3>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            ${listing.rent_monthly.toLocaleString()}
            <span className="text-sm font-normal text-gray-500">/mo</span>
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

      <div className="mt-3 flex gap-3 text-sm text-gray-600">
        {listing.bedrooms != null && <span>{listing.bedrooms} bed</span>}
        {listing.bathrooms != null && <span>{listing.bathrooms} bath</span>}
        {listing.sqft != null && (
          <span>{listing.sqft.toLocaleString()} sqft</span>
        )}
      </div>

      {listing.true_cost_total != null && (
        <p className="mt-2 text-sm text-gray-500">
          True Cost:{' '}
          <span className="font-medium text-gray-700">
            ${listing.true_cost_total.toLocaleString()}/mo
          </span>
        </p>
      )}
    </Link>
  );
}
