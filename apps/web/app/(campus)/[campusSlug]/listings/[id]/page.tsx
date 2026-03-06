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
import { ListingCard } from '../../../../../components/listing-card';
import { parseWkbPoint } from '../../../../../lib/parse-wkb-point';

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
    .select('*')
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

  return (
    <div className="animate-fade-in">
      <Link
        href={`/${campusSlug}/listings`}
        className="text-sm text-[var(--surface-400)] hover:text-[var(--surface-600)] transition-colors"
      >
        &larr; Back to listings
      </Link>

      {/* Photo Gallery */}
      <div className="mt-4">
        <ListingPhotoGallery
          photoUrls={photoUrls}
          sourceUrl={listing.source_url}
          address={listing.address}
        />
      </div>

      {/* Title + Price + Heart + Fairness */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--surface-900)]">
              {listing.address}
            </h1>
            {listing.rent_monthly != null ? (
              <p className="mt-1 text-3xl font-bold text-[var(--surface-900)]">
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

      {/* Posted date */}
      {postedDaysAgo != null && (
        <p className="mt-2 text-sm text-[var(--surface-400)]">
          {postedDaysAgo === 0
            ? 'Posted today'
            : postedDaysAgo === 1
              ? 'Posted yesterday'
              : `Posted ${postedDaysAgo} days ago`}
        </p>
      )}

      {/* Two-column layout */}
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Left column: Details + Amenities + Map */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl bg-white p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
              Details
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              {listing.bedrooms != null && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">
                    Bedrooms
                  </dt>
                  <dd className="mt-1 font-medium text-[var(--surface-700)]">
                    {listing.bedrooms === 0 ? 'Studio' : listing.bedrooms}
                  </dd>
                </div>
              )}
              {listing.bathrooms != null && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">
                    Bathrooms
                  </dt>
                  <dd className="mt-1 font-medium text-[var(--surface-700)]">
                    {listing.bathrooms}
                  </dd>
                </div>
              )}
              {listing.sqft != null && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">
                    Square Feet
                  </dt>
                  <dd className="mt-1 font-medium text-[var(--surface-700)]">
                    {listing.sqft.toLocaleString()}
                  </dd>
                </div>
              )}
              {listing.available_date && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">
                    Available
                  </dt>
                  <dd className="mt-1 font-medium text-[var(--surface-700)]">
                    {listing.available_date}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">
                  Source
                </dt>
                <dd className="mt-1 font-medium text-[var(--surface-700)]">
                  {listing.source}
                </dd>
              </div>
            </dl>
          </section>

          {amenities.length > 0 && (
            <section className="rounded-xl bg-white p-5 shadow-[var(--shadow-card)]">
              <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
                Amenities
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-[var(--primary-50)] px-3 py-1 text-sm text-[var(--primary-700)]"
                  >
                    {a.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Map */}
          {coordinates && (
            <section className="rounded-xl bg-white p-5 shadow-[var(--shadow-card)]">
              <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
                Location
              </h2>
              <div className="mt-3">
                <ListingLocationMap
                  latitude={coordinates.latitude}
                  longitude={coordinates.longitude}
                  address={listing.address}
                />
              </div>
            </section>
          )}
        </div>

        {/* Right column: True Cost + CribAI CTA + Similar */}
        <div className="space-y-6">
          {listing.rent_monthly != null && (
            <TrueCostCalculator
              rentMonthly={listing.rent_monthly}
              amenities={amenities}
            />
          )}

          {/* Ask CribAI CTA */}
          <Link
            href={`/${campusSlug}/cribai?about=${listing.id}&address=${encodeURIComponent(listing.address)}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-[var(--primary-200)] bg-[var(--primary-50)] px-5 py-3 text-sm font-medium text-[var(--primary-700)] shadow-sm hover:bg-[var(--primary-100)] transition-colors"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25z"
              />
            </svg>
            Ask CribAI about this place
          </Link>

          {listing.source_url && (
            <a
              href={listing.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--surface-200)] bg-white px-5 py-3 text-sm font-medium text-[var(--surface-600)] shadow-sm hover:bg-[var(--surface-50)] transition-colors"
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
