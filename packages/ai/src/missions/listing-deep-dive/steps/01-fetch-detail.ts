/**
 * Step 1: Fetch full listing details from the database.
 */
import type { MissionStep, StepContext, StepResult } from '../../types';

export const fetchDetailStep: MissionStep = {
  id: 'fetch_detail',
  label: 'Fetching listing details',
  tool: 'get_listing_detail',

  async run(ctx: StepContext): Promise<StepResult> {
    const listingId = ctx.input.listingId as string;
    if (!listingId) {
      return { output: { error: 'No listing ID provided' }, done: true };
    }

    const { data, error } = await ctx.supabase
      .from('listings')
      .select(
        'id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, fairness_data, true_cost, true_cost_total, amenities, available_date, description, source, contact_email, photo_urls, raw_data',
      )
      .eq('id', listingId)
      .eq('is_active', true)
      .single();
    // Note: campus_id filter intentionally omitted here — the mission's campus_id
    // comes from the launcher (hardcoded uw-madison), not the listing. The compare
    // step uses campus_id to scope comparisons, which is the correct boundary.

    if (error || !data) {
      return { output: { error: 'Listing not found or inactive' }, done: true };
    }

    return {
      output: {
        listing: {
          id: data.id,
          address: data.address,
          rentMonthly: Number(data.rent_monthly),
          bedrooms: data.bedrooms,
          bathrooms: data.bathrooms,
          sqft: data.sqft,
          fairnessScore: data.fairness_score,
          fairnessData: data.fairness_data,
          trueCost: data.true_cost,
          trueCostTotal: data.true_cost_total,
          amenities: data.amenities ?? [],
          availableDate: data.available_date,
          description: data.description,
          source: data.source,
          contactEmail: data.contact_email,
          photoUrls: data.photo_urls ?? [],
          rawData: data.raw_data,
        },
      },
    };
  },
};
