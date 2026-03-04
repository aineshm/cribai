import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';
import type { ListingSummary } from '@campusnest/types';

const inputSchema = z.object({
  listing_id: z.string().uuid(),
});

export async function getListingDetail(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const { listing_id } = inputSchema.parse(args);

  const { data, error } = await context.supabase
    .from('listings')
    .select(
      'id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, fairness_data, true_cost, true_cost_total, amenities, available_date',
    )
    .eq('id', listing_id)
    .eq('campus_id', context.campusId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    throw new Error('Listing not found or not available.');
  }

  const trueCost = data.true_cost as Record<string, number> | null;
  const fairnessData = data.fairness_data as Record<string, unknown> | null;

  const listing: ListingSummary = {
    id: data.id as string,
    address: data.address as string,
    rentMonthly: Number(data.rent_monthly),
    bedrooms: data.bedrooms as number | null,
    bathrooms: data.bathrooms as number | null,
    sqft: data.sqft as number | null,
    fairnessScore: data.fairness_score as number | null,
    trueCostTotal: data.true_cost_total as number | null,
    amenities: (data.amenities as string[] | null) ?? [],
    campusSlug: context.campusSlug,
  };

  const trueCostBreakdown = trueCost
    ? `True Cost Breakdown: rent=$${trueCost['rent']}, utilities=$${trueCost['utilities']}, parking=$${trueCost['parking']}, internet=$${trueCost['internet']}, laundry=$${trueCost['laundry']}, insurance=$${trueCost['renterInsurance']}, move-in=$${trueCost['moveInFees']}, TOTAL=$${trueCost['total']}/mo`
    : 'True cost not calculated yet.';

  const fairnessInfo = fairnessData
    ? `Fairness: ${data.fairness_score}/10, predicted rent=$${fairnessData['predictedRent']}, delta=${fairnessData['delta']}%, ${fairnessData['comparableCount']} comparables`
    : 'Fairness data not available.';

  const modelContext = [
    `Listing: ${data.address}`,
    `Rent: $${data.rent_monthly}/mo | ${data.bedrooms ?? '?'} bed / ${data.bathrooms ?? '?'} bath / ${data.sqft ?? '?'} sqft`,
    `Amenities: ${(listing.amenities.length > 0 ? listing.amenities : ['none listed']).join(', ')}`,
    `Available: ${data.available_date ?? 'Not specified'}`,
    trueCostBreakdown,
    fairnessInfo,
  ].join('\n');

  return {
    modelContext,
    clientBlock: { type: 'listing_card', listings: [listing] },
  };
}
