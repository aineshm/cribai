import Link from 'next/link';
import Image from 'next/image';
import { getScoreColorVariants } from '../lib/score-colors';
import { FreshnessBadge } from './freshness-badge';

interface ListingCardProps {
  readonly listing: {
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
  };
  readonly campusSlug: string;
}

function fairnessColor(score: number): string {
  const v = getScoreColorVariants(score);
  return `${v.bg} ${v.text}`;
}

function RentDisplay({ rentMonthly }: { readonly rentMonthly: number | null }) {
  if (rentMonthly != null) {
    return (
      <p className="mt-1 text-2xl font-bold text-[var(--surface-900)]">
        ${rentMonthly.toLocaleString()}
        <span className="text-sm font-normal text-[var(--surface-400)]">/mo</span>
      </p>
    );
  }
  return (
    <p className="mt-1 text-lg font-medium text-[var(--surface-400)]">
      Contact for pricing
    </p>
  );
}

export function ListingCard({ listing, campusSlug }: ListingCardProps) {
  const heroPhoto = listing.photo_urls[0] ?? null;

  return (
    <Link
      href={`/${campusSlug}/listings/${listing.id}`}
      className="block rounded-xl bg-white overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 transition-all duration-200"
    >
      {heroPhoto && (
        <div className="relative aspect-video">
          <Image
            src={heroPhoto}
            alt={`Photo of ${listing.address}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--surface-900)] line-clamp-1">
              {listing.address}
            </h3>
            <RentDisplay rentMonthly={listing.rent_monthly} />
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

        {listing.last_seen_at && (
          <div className="mt-2">
            <FreshnessBadge lastSeenAt={listing.last_seen_at} />
          </div>
        )}

        {listing.true_cost_total != null && (
          <p className="mt-2 text-sm text-[var(--surface-400)]">
            True Cost:{' '}
            <span className="font-medium text-[var(--primary-700)]">
              ${listing.true_cost_total.toLocaleString()}/mo
            </span>
          </p>
        )}
      </div>
    </Link>
  );
}
