import type { MissionStep, StepContext, StepResult } from '../../types';
import type { ResearchedListing, ListingSummary } from '@campusnest/types';
import type { ToolContext } from '../../../tools/types';
import { getReviews } from '../../../tools/handlers/get-reviews';
import { getNeighborhoodInfo } from '../../../tools/handlers/get-neighborhood-info';

/**
 * Parse Google rating from get_reviews modelContext.
 * Format: "... Google Rating: 4.2/5 (45 ratings) ..."
 */
export function extractReviewRating(modelContext: string): number | null {
  const match = /Google Rating:\s*([\d.]+)\/5/i.exec(modelContext);
  if (!match?.[1]) return null;
  const rating = parseFloat(match[1]);
  return isNaN(rating) ? null : rating;
}

/**
 * Parse first review snippet from get_reviews modelContext.
 * Format: "- [X/5] "text" -- Author ..."
 */
export function extractReviewSnippet(modelContext: string): string | null {
  const match = /- \[\d+\/5\] "([^"]{10,200})"/i.exec(modelContext);
  return match?.[1] ?? null;
}

/**
 * Parse Walk Score from get_neighborhood_info modelContext.
 * Format: "Walk Score: 75/100 ..."
 */
export function extractWalkScore(modelContext: string): number | null {
  const match = /Walk Score:\s*(\d+)\/100/i.exec(modelContext);
  if (!match?.[1]) return null;
  const score = parseInt(match[1], 10);
  return isNaN(score) ? null : score;
}

export const researchListingsStep: MissionStep = {
  id: 'research_listings',
  label: 'Researching top listings',

  async run(ctx: StepContext): Promise<StepResult> {
    const listings = (ctx.state.listings ?? []) as ListingSummary[];
    const topN = (ctx.state.topN ?? 5) as number;
    const targets = listings.slice(0, topN);

    const toolCtx: ToolContext = {
      supabase: ctx.supabase,
      campusId: ctx.campusId,
      campusSlug: ctx.campusSlug,
      userId: ctx.userId,
    };

    const researchedListings: ResearchedListing[] = [];

    // Sequential to avoid rate-limit spikes and stay within after() budget
    for (const listing of targets) {
      let reviewRating: number | null = null;
      let reviewSnippet: string | null = null;
      let walkScore: number | null = null;

      try {
        const reviewResult = await getReviews({ listing_id: listing.id }, toolCtx);
        reviewRating = extractReviewRating(reviewResult.modelContext);
        reviewSnippet = extractReviewSnippet(reviewResult.modelContext);
      } catch (err) {
        // Graceful degradation — API key absent or Places lookup failed
        console.warn(`[research] get_reviews failed for ${listing.id}:`, err);
      }

      try {
        const nbResult = await getNeighborhoodInfo({ listing_id: listing.id }, toolCtx);
        walkScore = extractWalkScore(nbResult.modelContext);
      } catch (err) {
        // Graceful degradation — Walk Score API key absent
        console.warn(`[research] get_neighborhood_info failed for ${listing.id}:`, err);
      }

      researchedListings.push({
        id: listing.id,
        address: listing.address,
        rentMonthly: listing.rentMonthly ?? 0,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        sqft: listing.sqft,
        amenities: listing.amenities ?? [],
        photoUrls: [],
        fairnessScore: listing.fairnessScore,
        reviewRating,
        reviewSnippet,
        walkScore,
        preferenceScore: null, // populated in step 4
      });
    }

    return {
      output: { researchedListings },
    };
  },
};
