/**
 * Step 5: Generate a comprehensive listing deep dive report.
 */
import type { MissionStep, StepContext, StepResult } from '../../types';

interface ListingData {
  readonly id: string;
  readonly address: string;
  readonly rentMonthly: number;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly fairnessScore: number | null;
  readonly amenities: readonly string[];
  readonly availableDate: string | null;
  readonly description: string | null;
  readonly source: string | null;
}

interface SimilarListing {
  readonly address: string;
  readonly rentMonthly: number;
  readonly fairnessScore: number | null;
}

export const generateReportStep: MissionStep = {
  id: 'generate_report',
  label: 'Generating report',

  async run(ctx: StepContext): Promise<StepResult> {
    const listing = ctx.state.listing as ListingData | undefined;
    const reviewSummary = (ctx.state.reviewSummary as string) ?? 'No reviews available';
    const averageRating = ctx.state.averageRating as number | null;
    const similarListings = (ctx.state.similarListings as readonly SimilarListing[]) ?? [];
    const trueCostSummary = (ctx.state.trueCostSummary as string) ?? 'Cost data unavailable';
    const trueCostTotal = ctx.state.trueCostTotal as number | null;

    if (!listing) {
      return {
        output: {
          report: { error: 'No listing data to generate report' },
        },
        done: true,
      };
    }

    // Build structured report
    const report = {
      listingId: listing.id,
      address: listing.address,
      overview: {
        rent: listing.rentMonthly,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        sqft: listing.sqft,
        fairnessScore: listing.fairnessScore,
        availableDate: listing.availableDate,
        source: listing.source,
      },
      description: listing.description,
      amenities: listing.amenities,
      reviews: {
        summary: reviewSummary,
        averageRating,
      },
      trueCost: {
        summary: trueCostSummary,
        total: trueCostTotal,
      },
      comparison: {
        similarCount: similarListings.length,
        listings: similarListings.map(l => ({
          address: l.address,
          rent: l.rentMonthly,
          fairnessScore: l.fairnessScore,
        })),
      },
      recommendation: generateRecommendation(listing, averageRating, similarListings, trueCostTotal),
    };

    return {
      output: { report },
      done: true,
    };
  },
};

function generateRecommendation(
  listing: ListingData,
  avgRating: number | null,
  similar: readonly SimilarListing[],
  trueCostTotal: number | null,
): string {
  const parts: string[] = [];

  // Fairness assessment
  if (listing.fairnessScore != null) {
    if (listing.fairnessScore >= 7) {
      parts.push(`Good value at ${listing.fairnessScore}/10 fairness score.`);
    } else if (listing.fairnessScore >= 5) {
      parts.push(`Average value at ${listing.fairnessScore}/10 fairness score.`);
    } else {
      parts.push(`Below-average value at ${listing.fairnessScore}/10 fairness score — consider negotiating rent.`);
    }
  }

  // Reviews
  if (avgRating != null) {
    if (avgRating >= 4) {
      parts.push(`Well-reviewed (${avgRating.toFixed(1)}/5).`);
    } else if (avgRating >= 3) {
      parts.push(`Mixed reviews (${avgRating.toFixed(1)}/5) — worth investigating concerns.`);
    } else {
      parts.push(`Low reviews (${avgRating.toFixed(1)}/5) — proceed with caution.`);
    }
  }

  // Price comparison
  if (similar.length > 0) {
    const avgSimilarRent = similar.reduce((s, l) => s + l.rentMonthly, 0) / similar.length;
    const diff = ((listing.rentMonthly - avgSimilarRent) / avgSimilarRent) * 100;
    if (diff > 10) {
      parts.push(`Priced ${Math.round(diff)}% above similar listings.`);
    } else if (diff < -10) {
      parts.push(`Priced ${Math.round(Math.abs(diff))}% below similar listings — good deal.`);
    } else {
      parts.push('Priced in line with similar listings.');
    }
  }

  // True cost
  if (trueCostTotal != null) {
    parts.push(`Estimated true monthly cost: $${trueCostTotal}.`);
  }

  return parts.length > 0
    ? parts.join(' ')
    : 'Insufficient data for a detailed recommendation. Consider visiting the property.';
}
