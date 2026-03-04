import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';
import type { ListingSummary } from '@campusnest/types';

const inputSchema = z.object({
  listing_ids: z.array(z.string().uuid()).min(2).max(4),
});

export async function compareListings(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const { listing_ids } = inputSchema.parse(args);

  const { data, error } = await context.supabase
    .from('listings')
    .select(
      'id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, true_cost_total, amenities',
    )
    .in('id', listing_ids)
    .eq('campus_id', context.campusId)
    .eq('is_active', true);

  if (error) {
    throw new Error(`Comparison failed: ${error.message}`);
  }

  if (!data || data.length < 2) {
    throw new Error('Need at least 2 valid listings to compare.');
  }

  const listings: readonly ListingSummary[] = data.map(row => ({
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

  const modelContext = `Comparison of ${listings.length} listings:\n${listings
    .map(
      (l, i) =>
        `${i + 1}. ${l.address}: $${l.rentMonthly}/mo, ${l.bedrooms ?? '?'} bed, ${l.sqft ?? '?'} sqft, fairness=${l.fairnessScore ?? 'N/A'}/10, true cost=$${l.trueCostTotal ?? 'N/A'}/mo`,
    )
    .join('\n')}`;

  return {
    modelContext,
    clientBlock: { type: 'comparison', listings: [...listings] },
  };
}
