'use client';

import Link from 'next/link';

interface ListingSummary {
  readonly id: string;
  readonly address: string;
  readonly rentMonthly: number;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly fairnessScore: number | null;
  readonly trueCostTotal: number | null;
  readonly amenities: readonly string[];
  readonly campusSlug?: string;
}

function fairnessColor(score: number): string {
  if (score >= 7) return 'bg-green-100 text-green-800';
  if (score >= 4) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

interface ChatListingCardProps {
  readonly listing: ListingSummary;
  readonly campusSlug: string;
}

export function ChatListingCard({ listing, campusSlug }: ChatListingCardProps) {
  const slug = listing.campusSlug ?? campusSlug;

  return (
    <Link
      href={`/${slug}/listings/${listing.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-300 hover:shadow-sm transition-all"
      aria-label={`View listing at ${listing.address}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">
            {listing.address}
          </p>
          <p className="mt-0.5 text-lg font-bold text-gray-900">
            ${listing.rentMonthly.toLocaleString()}
            <span className="text-xs font-normal text-gray-500">/mo</span>
          </p>
        </div>
        {listing.fairnessScore != null && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${fairnessColor(listing.fairnessScore)}`}
          >
            {listing.fairnessScore}/10
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-gray-500">
        {listing.bedrooms != null && <span>{listing.bedrooms} bed</span>}
        {listing.bathrooms != null && <span>{listing.bathrooms} bath</span>}
        {listing.sqft != null && <span>{listing.sqft.toLocaleString()} sqft</span>}
        {listing.trueCostTotal != null && (
          <span className="text-gray-700">
            True: ${listing.trueCostTotal.toLocaleString()}/mo
          </span>
        )}
      </div>
    </Link>
  );
}
