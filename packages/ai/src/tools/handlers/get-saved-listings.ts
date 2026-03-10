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
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return {
      modelContext: `Error fetching saved listings: ${error.message}`,
      clientBlock: { type: 'text', content: 'Something went wrong while fetching your saved listings. Please try again.' },
    };
  }

  const rows = (data ?? []) as unknown as readonly SavedListingRow[];

  if (rows.length === 0) {
    return {
      modelContext: 'User has no saved listings. Suggest they explore listings and save ones they like using the heart icon.',
      clientBlock: { type: 'text', content: 'You have no saved listings yet. Browse listings and tap the heart icon to save your favorites!' },
    };
  }

  const unsorted: readonly ListingSummary[] = rows.map(row => ({
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

  // Sort client-side — PostgREST doesn't support .order() on joined foreign table columns
  const listings: readonly ListingSummary[] = (() => {
    switch (parsed.sort) {
      case 'price_asc':
        return [...unsorted].sort((a, b) => (a.rentMonthly ?? Infinity) - (b.rentMonthly ?? Infinity));
      case 'price_desc':
        return [...unsorted].sort((a, b) => (b.rentMonthly ?? 0) - (a.rentMonthly ?? 0));
      case 'fairness':
        return [...unsorted].sort((a, b) => (b.fairnessScore ?? 0) - (a.fairnessScore ?? 0));
      default:
        return unsorted;
    }
  })();

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
