import { Suspense } from 'react';
import { createSecretClient } from '@campusnest/supabase/server';
import { ListingGrid } from '../../../../components/listing-grid';
import { ListingFilters } from '../../../../components/listing-filters';

interface ListingsPageProps {
  params: Promise<{ campusSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ListingsPage({
  params,
  searchParams,
}: ListingsPageProps) {
  const { campusSlug } = await params;
  const filters = await searchParams;
  const supabase = createSecretClient();

  // Get campus ID
  const { data: campus } = await supabase
    .from('campus_configs')
    .select('id, name')
    .eq('slug', campusSlug)
    .single();

  if (!campus) {
    return <p className="text-[var(--surface-400)]">Campus not found.</p>;
  }

  // Build query — fetch both active and stale listings
  let query = supabase
    .from('listings')
    .select(
      'id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, true_cost_total, amenities, photo_urls, source_url, last_seen_at, is_active'
    )
    .eq('campus_id', campus.id);

  if (filters.beds) {
    const beds = parseInt(filters.beds, 10);
    if (beds >= 4) {
      query = query.gte('bedrooms', 4);
    } else {
      query = query.eq('bedrooms', beds);
    }
  }

  if (filters.minPrice) {
    query = query.gte('rent_monthly', parseInt(filters.minPrice, 10));
  }

  if (filters.maxPrice) {
    query = query.lte('rent_monthly', parseInt(filters.maxPrice, 10));
  }

  // Sort
  switch (filters.sort) {
    case 'price_asc':
      query = query.order('rent_monthly', { ascending: true });
      break;
    case 'price_desc':
      query = query.order('rent_monthly', { ascending: false });
      break;
    case 'fairness':
      query = query.order('fairness_score', {
        ascending: false,
        nullsFirst: false,
      });
      break;
    default:
      query = query.order('rent_monthly', { ascending: true });
  }

  const { data: listings } = await query;

  return (
    <div className="animate-fade-in">
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--surface-900)]">
        Listings — {campus.name}
      </h1>
      <p className="mt-2 text-[var(--surface-500)]">
        Search and compare student housing with True Cost and Fairness Scores.
      </p>
      <div className="mt-6">
        <Suspense fallback={null}>
          <ListingFilters />
        </Suspense>
      </div>
      <div className="mt-6">
        <ListingGrid listings={listings ?? []} campusSlug={campusSlug} />
      </div>
    </div>
  );
}
