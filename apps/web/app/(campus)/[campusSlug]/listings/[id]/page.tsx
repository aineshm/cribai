import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createSecretClient, createServerComponentClient } from '@campusnest/supabase/server';
import { TrueCostCalculator } from '../../../../../components/true-cost-calculator';
import { FairnessBadge } from '../../../../../components/fairness-badge';
import { FreshnessBadge } from '../../../../../components/freshness-badge';
import { ListingPhotoGallery } from '../../../../../components/listing-photo-gallery';
import { ListingLocationMap } from '../../../../../components/listing-location-map';
import { HeartButton } from '../../../../../components/heart-button';
import { ShareButton } from '../../../../../components/share-button';
import { ListingCard } from '../../../../../components/listing-card';
import { parseWkbPoint } from '@campusnest/utils';

interface ListingDetailPageProps {
  params: Promise<{ campusSlug: string; id: string }>;
}

function getDaysSince(isoDate: string): number {
  const then = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export default async function ListingDetailPage({
  params,
}: ListingDetailPageProps) {
  const { campusSlug, id } = await params;
  const supabase = createSecretClient();

  const { data: listing } = await supabase
    .from('listings')
    .select('id, campus_id, address, rent_monthly, bedrooms, bathrooms, sqft, amenities, photo_urls, source_url, source, location, fairness_score, fairness_data, true_cost_total, available_date, first_seen_at, last_seen_at, is_active')
    .eq('id', id)
    .single();

  if (!listing) {
    notFound();
  }

  const amenities: string[] = listing.amenities ?? [];
  const photoUrls: string[] = listing.photo_urls ?? [];
  const coordinates = parseWkbPoint(listing.location as string | null);

  // Fetch user session for saved state
  let isSaved = false;
  try {
    const cookieStore = await cookies();
    const authSupabase = createServerComponentClient(cookieStore);
    const { data: { user } } = await authSupabase.auth.getUser();
    if (user) {
      const { data: save } = await authSupabase
        .from('saved_listings')
        .select('id')
        .eq('listing_id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      isSaved = save !== null;
    }
  } catch {
    // Unauthenticated -- not saved
  }

  // Fetch similar listings (+-30% price, same campus, excluding current)
  let similarListings: Array<{
    id: string;
    address: string;
    rent_monthly: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    sqft: number | null;
    fairness_score: number | null;
    true_cost_total: number | null;
    amenities: string[];
    photo_urls: string[];
    source_url: string | null;
    last_seen_at: string | null;
    is_active: boolean;
  }> = [];

  if (listing.rent_monthly != null && listing.campus_id) {
    const minPrice = Math.round(listing.rent_monthly * 0.7);
    const maxPrice = Math.round(listing.rent_monthly * 1.3);
    const { data: similar } = await supabase
      .from('listings')
      .select(
        'id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, true_cost_total, amenities, photo_urls, source_url, last_seen_at, is_active'
      )
      .eq('campus_id', listing.campus_id)
      .eq('is_active', true)
      .neq('id', listing.id)
      .gte('rent_monthly', minPrice)
      .lte('rent_monthly', maxPrice)
      .order('rent_monthly', { ascending: true })
      .limit(3);

    if (similar) {
      similarListings = similar;
    }
  }

  const postedDaysAgo =
    listing.first_seen_at != null ? getDaysSince(listing.first_seen_at) : null;

  const SOURCE_NAMES: Record<string, string> = {
    'apartments.com': 'Apartments.com',
    craigslist: 'Craigslist',
    zillow: 'Zillow',
    web_search: 'Web Search',
    facebook_marketplace: 'Facebook Marketplace',
    hotpads: 'HotPads',
    manual: 'Community Submission',
  };
  const sourceName = SOURCE_NAMES[listing.source ?? ''] ?? (listing.source ?? 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

  return (
    <div className="animate-fade-in">
      <Link
        href={`/${campusSlug}/listings`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--surface-400)] hover:text-[var(--surface-600)] transition-colors"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to listings
      </Link>

      {/* Photo Gallery — always shows, with placeholder for no-photo listings */}
      <div className="mt-4">
        <ListingPhotoGallery
          photoUrls={photoUrls}
          sourceUrl={listing.source_url}
          address={listing.address}
        />
      </div>

      {/* Title + Price + Heart + Badges */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl text-[var(--surface-900)]">
              {listing.address}
            </h1>
            {listing.rent_monthly != null ? (
              <p className="mt-1 text-2xl sm:text-3xl font-bold text-[var(--surface-900)]">
                ${listing.rent_monthly.toLocaleString()}
                <span className="text-base font-normal text-[var(--surface-400)]">
                  /mo
                </span>
              </p>
            ) : (
              <p className="mt-1 text-lg text-[var(--surface-400)]">
                Contact for pricing
              </p>
            )}
          </div>
          <HeartButton
            listingId={listing.id}
            initialSaved={isSaved}
            campusSlug={campusSlug}
            size="md"
            variant="inline"
          />
        </div>

        <div className="flex items-center gap-3">
          {listing.last_seen_at && (
            <FreshnessBadge lastSeenAt={listing.last_seen_at} />
          )}
          {listing.fairness_score != null && (
            <FairnessBadge
              score={listing.fairness_score}
              data={listing.fairness_data}
            />
          )}
        </div>
      </div>

      {/* Meta row: posted date + source */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--surface-400)]">
        {postedDaysAgo != null && (
          <span>
            {postedDaysAgo === 0
              ? 'Posted today'
              : postedDaysAgo === 1
                ? 'Posted yesterday'
                : `Posted ${postedDaysAgo} days ago`}
          </span>
        )}
        {postedDaysAgo != null && <span className="text-[var(--surface-300)]">·</span>}
        <span>via {sourceName}</span>
      </div>

      {/* Two-column layout */}
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Left column: Details + Amenities + Map */}
        <div className="space-y-6 lg:col-span-2">
          {/* Details — always shown */}
          <section className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
              Details
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">
                  Bedrooms
                </dt>
                <dd className="mt-1 font-medium text-[var(--surface-700)]">
                  {listing.bedrooms != null
                    ? listing.bedrooms === 0
                      ? 'Studio'
                      : listing.bedrooms
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">
                  Bathrooms
                </dt>
                <dd className="mt-1 font-medium text-[var(--surface-700)]">
                  {listing.bathrooms != null ? listing.bathrooms : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">
                  Square Feet
                </dt>
                <dd className="mt-1 font-medium text-[var(--surface-700)]">
                  {listing.sqft != null ? listing.sqft.toLocaleString() : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">
                  Available
                </dt>
                <dd className="mt-1 font-medium text-[var(--surface-700)]">
                  {listing.available_date ?? '—'}
                </dd>
              </div>
            </dl>
          </section>

          {/* Amenities — always shown */}
          <section className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
              Amenities
            </h2>
            {amenities.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-[var(--primary-50)] px-3 py-1.5 text-sm text-[var(--primary-700)]"
                  >
                    {a.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--surface-400)]">
                No amenities listed. Ask CribAI for details about this property.
              </p>
            )}
          </section>

          {/* Location — always shown */}
          <section className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
              Location
            </h2>
            {coordinates ? (
              <div className="mt-4">
                <ListingLocationMap
                  latitude={coordinates.latitude}
                  longitude={coordinates.longitude}
                  address={listing.address}
                />
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-center rounded-xl bg-[var(--surface-100)] py-12">
                <div className="text-center">
                  <svg className="mx-auto h-8 w-8 text-[var(--surface-300)]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  <p className="mt-2 text-sm text-[var(--surface-400)]">Map unavailable for this listing</p>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right column: True Cost + CribAI CTA + Actions */}
        <div className="space-y-6">
          {/* True Cost — always shown with CTA if no rent */}
          {listing.rent_monthly != null ? (
            <TrueCostCalculator
              rentMonthly={listing.rent_monthly}
              amenities={amenities}
            />
          ) : (
            <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]">
              <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
                True Cost
              </h2>
              <p className="mt-3 text-sm text-[var(--surface-400)]">
                Pricing not available. Contact the property or ask CribAI for estimated costs.
              </p>
            </div>
          )}

          {/* Ask CribAI CTA */}
          <Link
            href={`/${campusSlug}/cribai?about=${listing.id}&address=${encodeURIComponent(listing.address)}`}
            className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--primary-200)] bg-[var(--primary-50)] px-5 py-3.5 text-sm font-medium text-[var(--primary-700)] shadow-sm hover:bg-[var(--primary-100)] hover:shadow-md transition-all duration-200"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
              />
            </svg>
            Ask CribAI about this place
          </Link>

          <ShareButton
            title={`${listing.address} — CampusNest`}
            url={`/${campusSlug}/listings/${listing.id}`}
          />

          {listing.source_url && (
            <a
              href={listing.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--surface-200)] bg-white px-5 py-3.5 text-sm font-medium text-[var(--surface-600)] shadow-sm hover:bg-[var(--surface-50)] hover:shadow-md transition-all duration-200"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
              View original listing
            </a>
          )}
        </div>
      </div>

      {/* Similar Listings */}
      {similarListings.length > 0 && (
        <section className="mt-10">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--surface-900)]">
            Similar Nearby
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {similarListings.map((similar) => (
              <ListingCard
                key={similar.id}
                listing={similar}
                campusSlug={campusSlug}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
