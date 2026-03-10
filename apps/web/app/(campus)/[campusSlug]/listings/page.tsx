import { Suspense } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createSecretClient, createServerComponentClient } from '@campusnest/supabase/server';
import { ListingGrid } from '../../../../components/listing-grid';
import { ListingFilters } from '../../../../components/listing-filters';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 18;

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

  const page = Math.max(1, parseInt(filters.page ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Get campus ID
  const { data: campus } = await supabase
    .from('campus_configs')
    .select('id, name')
    .eq('slug', campusSlug)
    .single();

  if (!campus) {
    return <p className="text-[var(--surface-400)]">Campus not found.</p>;
  }

  // Build query with count for pagination
  let query = supabase
    .from('listings')
    .select(
      'id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, true_cost_total, amenities, photo_urls, source_url, last_seen_at, is_active',
      { count: 'exact' }
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
    query = query
      .not('rent_monthly', 'is', null)
      .gt('rent_monthly', 0)
      .gte('rent_monthly', parseInt(filters.minPrice, 10));
  }

  if (filters.maxPrice) {
    query = query
      .not('rent_monthly', 'is', null)
      .lte('rent_monthly', parseInt(filters.maxPrice, 10));
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

  // Apply pagination range
  query = query.range(from, to);

  const { data: listings, count: totalCount } = await query;

  const total = totalCount ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Fetch saved listing IDs for authenticated user (optional)
  let savedListingIds = new Set<string>();
  try {
    const cookieStore = await cookies();
    const authSupabase = createServerComponentClient(cookieStore);
    const { data: { user } } = await authSupabase.auth.getUser();
    if (user) {
      const { data: saves } = await authSupabase
        .from('saved_listings')
        .select('listing_id')
        .eq('user_id', user.id);
      if (saves) {
        savedListingIds = new Set(saves.map((s: { listing_id: string }) => s.listing_id));
      }
    }
  } catch {
    // Unauthenticated users — no saved listings
  }

  // Build pagination URL preserving existing filters
  function paginationHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (filters.beds) params.set('beds', filters.beds);
    if (filters.minPrice) params.set('minPrice', filters.minPrice);
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
    if (filters.sort) params.set('sort', filters.sort);
    if (targetPage > 1) params.set('page', String(targetPage));
    const qs = params.toString();
    return `/${campusSlug}/listings${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--surface-900)]">
          Listings — {campus.name}
        </h1>
        {total > 0 && (
          <span className="text-sm text-[var(--surface-400)]">
            {total} {total === 1 ? 'listing' : 'listings'} found
          </span>
        )}
      </div>
      <p className="mt-2 text-[var(--surface-500)]">
        Search and compare student housing with True Cost and Fairness Scores.
      </p>
      <div className="mt-6">
        <Suspense fallback={null}>
          <ListingFilters />
        </Suspense>
      </div>
      <div className="mt-6">
        <ListingGrid listings={listings ?? []} campusSlug={campusSlug} savedListingIds={savedListingIds} />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
          {page > 1 && (
            <Link
              href={paginationHref(page - 1)}
              className="rounded-lg border border-[var(--surface-200)] px-3 py-2 text-sm text-[var(--surface-600)] hover:bg-[var(--surface-50)] transition-colors"
            >
              Previous
            </Link>
          )}

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
            .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
              if (idx > 0) {
                const prev = arr[idx - 1]!;
                if (p - prev > 1) acc.push('ellipsis');
              }
              acc.push(p);
              return acc;
            }, [])
            .map((item, idx) =>
              item === 'ellipsis' ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-sm text-[var(--surface-400)]">
                  ...
                </span>
              ) : (
                <Link
                  key={item}
                  href={paginationHref(item)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    item === page
                      ? 'bg-[var(--primary-600)] text-white'
                      : 'border border-[var(--surface-200)] text-[var(--surface-600)] hover:bg-[var(--surface-50)]'
                  }`}
                  aria-current={item === page ? 'page' : undefined}
                >
                  {item}
                </Link>
              )
            )}

          {page < totalPages && (
            <Link
              href={paginationHref(page + 1)}
              className="rounded-lg border border-[var(--surface-200)] px-3 py-2 text-sm text-[var(--surface-600)] hover:bg-[var(--surface-50)] transition-colors"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
