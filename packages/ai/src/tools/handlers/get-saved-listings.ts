import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';
import type { ListingSummary } from '@campusnest/types';

const inputSchema = z.object({
  sort: z.enum(['saved_date', 'price_asc', 'price_desc', 'fairness']).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

interface SavedListingRow {
  readonly listing_id: string;
  readonly created_at: string;
  readonly listings: {
    readonly id: string;
    readonly address: string;
    readonly rent_monthly: number | null;
    readonly bedrooms: number | null;
    readonly bathrooms: number | null;
    readonly sqft: number | null;
    readonly fairness_score: number | null;
    readonly true_cost_total: number | null;
    readonly amenities: readonly string[] | null;
  };
}

export async function getSavedListings(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  if (!context.userId) {
    return {
      modelContext: 'User is not logged in. Suggest they sign in to see their saved listings.',
      clientBlock: { type: 'text', content: 'Please sign in to view your saved listings.' },
    };
  }

  const parsed = inputSchema.parse(args);
  const limit = Math.min(parsed.limit ?? 10, 20);

  // Fetch saved listings — sort by saved_date at DB level (always works),
  // then sort client-side for joined-table columns (PostgREST doesn't support
  // dotted column names like 'listings.rent_monthly' in .order()).
  const { data, error } = await context.supabase
    .from('saved_listings')
    .select(`
      listing_id,
      created_at,
      listings!inner (
        id, address, rent_monthly, bedrooms, bathrooms, sqft,
        fairness_score, true_cost_total, amenities
      )
    `)
    .eq('user_id', context.userId)
    .order('created_at', { ascending: false });

  if (error) {
    return {
      modelContext: `Error fetching saved listings: ${error.message}`,
      clientBlock: { type: 'text', content: 'Something went wrong while fetching your saved listings. Please try again.' },
    };
  }

  const allRows = (data ?? []) as unknown as readonly SavedListingRow[];

  // Client-side sort for joined-table columns
  const sorted = [...allRows].sort((a, b) => {
    switch (parsed.sort) {
      case 'price_asc':
        return (a.listings.rent_monthly ?? Infinity) - (b.listings.rent_monthly ?? Infinity);
      case 'price_desc':
        return (b.listings.rent_monthly ?? 0) - (a.listings.rent_monthly ?? 0);
      case 'fairness':
        return (b.listings.fairness_score ?? 0) - (a.listings.fairness_score ?? 0);
      case 'saved_date':
      default:
        // Already sorted by created_at desc from DB
        return 0;
    }
  });

  const rows = sorted.slice(0, limit);

  if (rows.length === 0) {
    return {
      modelContext: 'User has no saved listings. Suggest they explore listings and save ones they like using the heart icon.',
      clientBlock: { type: 'text', content: 'You have no saved listings yet. Browse listings and tap the heart icon to save your favorites!' },
    };
  }

  // Rows are already sorted by the Supabase query
  const listings: readonly ListingSummary[] = rows.map(row => ({
    id: row.listings.id,
    address: row.listings.address,
    rentMonthly: row.listings.rent_monthly != null ? Number(row.listings.rent_monthly) : null,
    bedrooms: row.listings.bedrooms,
    bathrooms: row.listings.bathrooms,
    sqft: row.listings.sqft,
    fairnessScore: row.listings.fairness_score,
    trueCostTotal: row.listings.true_cost_total,
    amenities: Array.isArray(row.listings.amenities) ? [...row.listings.amenities] : [],
    campusSlug: context.campusSlug,
  }));

  const modelContext = `User has ${listings.length} saved listing(s):\n${listings
    .map(
      (l, i) =>
        `${i + 1}. ${l.address} — $${l.rentMonthly}/mo, ${l.bedrooms ?? '?'} bed, fairness: ${l.fairnessScore ?? 'N/A'}/10`,
    )
    .join('\n')}`;

  return {
    modelContext,
    clientBlock: { type: 'listing_card', listings: [...listings] },
  };
}
