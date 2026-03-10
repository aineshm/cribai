'use client';

import Link from 'next/link';

interface ListingSummary {
  readonly id: string;
  readonly address: string;
  readonly rentMonthly: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly fairnessScore: number | null;
  readonly trueCostTotal: number | null;
  readonly amenities: readonly string[];
  readonly campusSlug?: string;
}

function fairnessColor(score: number): string {
  if (score >= 7) return 'bg-[var(--fair-good-bg)] text-[var(--fair-good)]';
  if (score >= 4) return 'bg-[var(--fair-ok-bg)] text-[var(--fair-ok)]';
  return 'bg-[var(--fair-bad-bg)] text-[var(--fair-bad)]';
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
      className="block rounded-lg border border-[var(--surface-200)] bg-white p-3 hover:border-[var(--primary-400)] hover:shadow-sm transition-all"
      aria-label={`View listing at ${listing.address}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--surface-900)]">
            {listing.address}
          </p>
          <p className="mt-0.5 text-lg font-bold text-[var(--surface-900)]">
            {listing.rentMonthly != null ? `$${listing.rentMonthly.toLocaleString()}` : 'Price N/A'}
            {listing.rentMonthly != null && <span className="text-xs font-normal text-[var(--surface-500)]">/mo</span>}
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
      <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-[var(--surface-500)]">
        {listing.bedrooms != null && <span>{listing.bedrooms} bed</span>}
        {listing.bathrooms != null && <span>{listing.bathrooms} bath</span>}
        {listing.sqft != null && <span>{listing.sqft.toLocaleString()} sqft</span>}
        {listing.trueCostTotal != null && (
          <span className="text-[var(--surface-700)]">
            True: ${listing.trueCostTotal.toLocaleString()}/mo
          </span>
        )}
      </div>
    </Link>
  );
}
