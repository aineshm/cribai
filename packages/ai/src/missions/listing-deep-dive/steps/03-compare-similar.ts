/**
 * Step 3: Find and compare similar listings by price/location/size.
 */
import type { MissionStep, StepContext, StepResult } from '../../types';

interface ListingData {
  readonly id: string;
  readonly rentMonthly: number;
  readonly bedrooms: number | null;
}

export const compareSimilarStep: MissionStep = {
  id: 'compare_similar',
  label: 'Comparing similar listings',
  tool: 'compare_listings',

  async run(ctx: StepContext): Promise<StepResult> {
    const listing = ctx.state.listing as ListingData | undefined;
    if (!listing) {
      return { output: { similarListings: [], comparisonSummary: 'No listing data for comparison' } };
    }

    const rent = listing.rentMonthly;
    const beds = listing.bedrooms;

    // Find similar listings: same bedroom count, ±30% rent, same campus
    const rentMin = Math.max(0, rent * 0.7);
    const rentMax = rent * 1.3;

    let query = ctx.supabase
      .from('listings')
      .select('id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, true_cost_total, amenities, source')
      .eq('is_active', true)
      .gte('rent_monthly', rentMin)
      .lte('rent_monthly', rentMax)
      .neq('id', listing.id)
      .limit(5)
      .order('fairness_score', { ascending: false, nullsFirst: false });

    if (beds != null) {
      query = query.eq('bedrooms', beds);
    }

    const { data } = await query;
    const similarListings = (data ?? []).map(row => ({
      id: row.id as string,
      address: row.address as string,
      rentMonthly: Number(row.rent_monthly),
      bedrooms: row.bedrooms as number | null,
      bathrooms: row.bathrooms as number | null,
      sqft: row.sqft as number | null,
      fairnessScore: row.fairness_score as number | null,
      trueCostTotal: row.true_cost_total as number | null,
      amenities: (row.amenities as string[] | null) ?? [],
      source: row.source as string | null,
    }));

    const comparisonSummary = similarListings.length > 0
      ? `Found ${similarListings.length} similar listing(s) in the same price range ($${Math.round(rentMin)}-$${Math.round(rentMax)}/mo, ${beds ?? 'any'} bed)`
      : 'No similar listings found in this price range.';

    return {
      output: {
        similarListings,
        similarCount: similarListings.length,
        comparisonSummary,
      },
    };
  },
};
