import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { ListingCard } from '../../../../components/listing-card';

interface SavedListingsPageProps {
  params: Promise<{ campusSlug: string }>;
}

export default async function SavedListingsPage({
  params,
}: SavedListingsPageProps) {
  const { campusSlug } = await params;
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=/${campusSlug}/saved`);
  }

  const { data: savedEntries } = await supabase
    .from('saved_listings')
    .select(
      `
      listing_id,
      created_at,
      listings!inner (
        id, address, rent_monthly, bedrooms, bathrooms, sqft,
        fairness_score, true_cost_total, amenities, photo_urls,
        source_url, last_seen_at, is_active
      )
    `
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Flatten the joined data
  const listings = (savedEntries ?? [])
    .map((entry) => {
      const listing = entry.listings as unknown as {
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
      };
      return listing;
    })
    .filter(Boolean);

  const count = listings.length;

  return (
    <div className="animate-fade-in">
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--surface-900)]">
        Saved Listings
        {count > 0 && (
          <span className="ml-2 text-lg font-normal text-[var(--surface-400)]">
            ({count})
          </span>
        )}
      </h1>

      {count === 0 ? (
        <div className="mt-16 flex flex-col items-center justify-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-100)]">
            <svg
              className="h-8 w-8 text-[var(--surface-400)]"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
              />
            </svg>
          </div>
          <p className="mt-4 font-[family-name:var(--font-display)] text-xl text-[var(--surface-800)]">
            No saved listings yet
          </p>
          <p className="mt-2 text-sm text-[var(--surface-400)]">
            Find your next place with CribAI
          </p>
          <Link
            href={`/${campusSlug}/cribai`}
            className="mt-6 rounded-lg bg-[var(--primary-600)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-700)] transition-colors"
          >
            Chat with CribAI
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing, index) => (
            <div
              key={listing.id}
              className="stagger-item"
              style={{ '--stagger-index': index } as React.CSSProperties}
            >
              <ListingCard
                listing={listing}
                campusSlug={campusSlug}
                isSaved={true}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
