/**
 * Step 4: Calculate true cost breakdown with utilities estimate.
 */
import type { MissionStep, StepContext, StepResult } from '../../types';

interface ListingData {
  readonly rentMonthly: number;
  readonly trueCost: Record<string, number> | null;
  readonly trueCostTotal: number | null;
  readonly amenities: readonly string[];
}

export const trueCostStep: MissionStep = {
  id: 'calculate_true_cost',
  label: 'Calculating true cost',

  async run(ctx: StepContext): Promise<StepResult> {
    const listing = ctx.state.listing as ListingData | undefined;
    if (!listing) {
      return { output: { trueCostBreakdown: null, trueCostSummary: 'No listing data for cost calculation' } };
    }

    // If true cost already exists in the listing, use it
    if (listing.trueCost && listing.trueCostTotal) {
      const tc = listing.trueCost;
      return {
        output: {
          trueCostBreakdown: tc,
          trueCostTotal: listing.trueCostTotal,
          trueCostSummary: `True monthly cost: $${listing.trueCostTotal}/mo (rent: $${tc.rent ?? listing.rentMonthly}, utilities: ~$${tc.utilities ?? 0}, parking: $${tc.parking ?? 0}, internet: $${tc.internet ?? 0}, laundry: $${tc.laundry ?? 0}, insurance: $${tc.renterInsurance ?? 0})`,
        },
      };
    }

    // Estimate if not pre-computed
    const amenitiesLower = listing.amenities.map(a => a.toLowerCase());
    const hasParking = amenitiesLower.some(a => a.includes('parking'));
    const hasLaundry = amenitiesLower.some(a => a.includes('laundry') || a.includes('washer'));
    const hasHeatIncluded = amenitiesLower.some(a => a.includes('heat included'));

    const estimates = {
      rent: listing.rentMonthly,
      utilities: hasHeatIncluded ? 50 : 120, // Madison average
      parking: hasParking ? 0 : 75,
      internet: 45,
      laundry: hasLaundry ? 0 : 15,
      renterInsurance: 15,
    };

    const total = Object.values(estimates).reduce((a, b) => a + b, 0);

    return {
      output: {
        trueCostBreakdown: estimates,
        trueCostTotal: total,
        trueCostSummary: `Estimated true monthly cost: $${total}/mo (rent: $${estimates.rent}, utilities: ~$${estimates.utilities}, parking: $${estimates.parking}, internet: $${estimates.internet}, laundry: $${estimates.laundry}, insurance: $${estimates.renterInsurance})`,
      },
    };
  },
};
