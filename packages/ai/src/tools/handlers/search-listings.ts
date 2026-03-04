import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';
import type { ListingSummary } from '@campusnest/types';

const inputSchema = z.object({
  bedrooms: z.number().int().min(0).max(10).optional(),
  min_rent: z.number().min(0).optional(),
  max_rent: z.number().min(0).optional(),
  min_fairness: z.number().min(1).max(10).optional(),
  amenities: z.array(z.string()).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'fairness']).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

export async function searchListings(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);
  const limit = parsed.limit ?? 5;

  let query = context.supabase
    .from('listings')
    .select(
      'id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, true_cost_total, amenities',
    )
    .eq('campus_id', context.campusId)
    .eq('is_active', true);

  if (parsed.bedrooms !== undefined) {
    if (parsed.bedrooms >= 4) {
      query = query.gte('bedrooms', 4);
    } else {
      query = query.eq('bedrooms', parsed.bedrooms);
    }
  }

  if (parsed.min_rent !== undefined) {
    query = query.gte('rent_monthly', parsed.min_rent);
  }

  if (parsed.max_rent !== undefined) {
    query = query.lte('rent_monthly', parsed.max_rent);
  }

  if (parsed.min_fairness !== undefined) {
    query = query.gte('fairness_score', parsed.min_fairness);
  }

  switch (parsed.sort) {
    case 'price_desc':
      query = query.order('rent_monthly', { ascending: false });
      break;
    case 'fairness':
      query = query.order('fairness_score', { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order('rent_monthly', { ascending: true });
  }

  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  const listings: readonly ListingSummary[] = (data ?? []).map(row => ({
    id: row.id as string,
    address: row.address as string,
    rentMonthly: Number(row.rent_monthly),
    bedrooms: row.bedrooms as number | null,
    bathrooms: row.bathrooms as number | null,
    sqft: row.sqft as number | null,
    fairnessScore: row.fairness_score as number | null,
    trueCostTotal: row.true_cost_total as number | null,
    amenities: (row.amenities as string[] | null) ?? [],
    campusSlug: context.campusSlug,
  }));

  // Filter by amenities client-side (jsonb contains is tricky)
  const filtered = parsed.amenities?.length
    ? listings.filter(l => {
        const lowerAmenities = l.amenities.map((a: string) => a.toLowerCase());
        return parsed.amenities!.every((req: string) =>
          lowerAmenities.some((a: string) => a.includes(req.toLowerCase())),
        );
      })
    : listings;

  const modelContext = filtered.length === 0
    ? 'No listings found matching the criteria.'
    : `Found ${filtered.length} listing(s):\n${filtered
        .map(
          (l, i) =>
            `${i + 1}. ${l.address} — $${l.rentMonthly}/mo, ${l.bedrooms ?? '?'} bed, fairness: ${l.fairnessScore ?? 'N/A'}/10`,
        )
        .join('\n')}`;

  return {
    modelContext,
    clientBlock: { type: 'listing_card', listings: [...filtered] },
  };
}
