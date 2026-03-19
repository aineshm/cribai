/**
 * Step 2: Pull reviews from database and web search.
 */
import type { MissionStep, StepContext, StepResult } from '../../types';

interface ListingData {
  readonly address: string;
  readonly source: string | null;
}

export const pullReviewsStep: MissionStep = {
  id: 'pull_reviews',
  label: 'Pulling reviews',
  tool: 'get_reviews',

  async run(ctx: StepContext): Promise<StepResult> {
    const listing = ctx.state.listing as ListingData | undefined;
    if (!listing) {
      return { output: { reviews: [], reviewSummary: 'No listing data available for review lookup' } };
    }

    // Query community_reviews table for this address
    const { data: dbReviews } = await ctx.supabase
      .from('community_reviews')
      .select('rating, review_text, source, created_at')
      .ilike('property_address', `%${listing.address.split(',')[0]}%`)
      .limit(10);

    const reviews = (dbReviews ?? []).map(r => ({
      rating: r.rating as number | null,
      text: r.review_text as string,
      source: r.source as string,
      date: r.created_at as string,
    }));

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviews.filter(r => r.rating != null).length
      : null;

    const reviewSummary = reviews.length > 0
      ? `Found ${reviews.length} review(s). Average rating: ${avgRating?.toFixed(1) ?? 'N/A'}/5`
      : 'No reviews found for this property.';

    return {
      output: {
        reviews,
        reviewCount: reviews.length,
        averageRating: avgRating,
        reviewSummary,
      },
    };
  },
};
