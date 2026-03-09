import Link from 'next/link';
import Image from 'next/image';
import { getScoreColorVariants } from '../lib/score-colors';
import { FreshnessBadge } from './freshness-badge';
import { HeartButton } from './heart-button';

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
    readonly source?: string;
  };
  readonly campusSlug: string;
  readonly isSaved?: boolean;
}

function fairnessColor(score: number): string {
  const v = getScoreColorVariants(score);
  return `${v.bg} ${v.text}`;
}

const SOURCE_NAMES: Record<string, string> = {
  'apartments.com': 'Apartments.com',
  craigslist: 'Craigslist',
  zillow: 'Zillow',
  web_search: 'Web Search',
  facebook_marketplace: 'Facebook Marketplace',
  hotpads: 'HotPads',
};

function formatSourceName(source: string): string {
  return SOURCE_NAMES[source] ?? source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

export function ListingCard({ listing, campusSlug, isSaved }: ListingCardProps) {
  const heroPhoto = listing.photo_urls[0] ?? null;

  return (
    <Link
      href={`/${campusSlug}/listings/${listing.id}`}
      className="block rounded-xl bg-white overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="relative aspect-video">
        {heroPhoto ? (
          <Image
            src={heroPhoto}
            alt={`Photo of ${listing.address}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--surface-100)]">
            <div className="text-center">
              <svg className="mx-auto h-8 w-8 text-[var(--surface-300)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21z" />
              </svg>
              <p className="mt-1 text-xs text-[var(--surface-300)]">No photo</p>
            </div>
          </div>
        )}
        <HeartButton
          listingId={listing.id}
          initialSaved={isSaved ?? false}
          campusSlug={campusSlug}
          size="sm"
        />
      </div>

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
          <p className="mt-2 text-sm text-[var(--surface-400)] group/truecost relative">
            <span className="cursor-help border-b border-dashed border-[var(--surface-300)]">True Cost</span>:{' '}
            <span className="font-medium text-[var(--primary-700)]">
              ${listing.true_cost_total.toLocaleString()}/mo
            </span>
            <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-52 rounded-lg bg-[var(--surface-800)] px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/truecost:opacity-100">
              Includes estimated utilities, parking, internet, and other fees beyond base rent.
            </span>
          </p>
        )}

        {listing.source && (
          <span className="mt-2 block text-xs text-[var(--surface-400)]">
            via {formatSourceName(listing.source)}
          </span>
        )}
      </div>
    </Link>
  );
}
