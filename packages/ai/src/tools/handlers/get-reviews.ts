import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';
import { getCached, setCache } from '../lib/api-cache';
import { textSearchPlace, getPlaceDetails } from '../lib/google-places';
import type { PlaceReview } from '../lib/google-places';
import { createGeminiClient } from '../../gemini-client';

const inputSchema = z.object({
  listing_id: z.string().uuid().optional(),
  address: z.string().optional(),
});

const CACHE_TTL_MS = 86_400_000; // 24 hours

async function resolveAddress(
  listingId: string,
  context: ToolContext,
): Promise<string | null> {
  // AIN-63: intentionally unfiltered by source — reviews resolve any listing in the full corpus, incl. scraped properties
  const { data, error } = await context.supabase
    .from('listings')
    .select('address')
    .eq('id', listingId)
    .single();

  // AIN-90 Fix 2: a hallucinated/non-existent listing_id (e.g. the model
  // inventing an all-zeros UUID) must degrade gracefully — return null so the
  // caller can fall back to an explicit address, or a graceful empty state,
  // instead of throwing a raw "not found" error.
  if (error || !data?.address) {
    return null;
  }

  return data.address as string;
}

/**
 * Reviews with a quotable body. Google Places API (New) marks `text`
 * OPTIONAL — a rating-only review has none. Filtering here (before any
 * quote/text-extraction site) keeps those reviews out of quotes/snippets
 * without dropping them from Google's own rating aggregate, which is
 * computed server-side and passed through untouched.
 */
function reviewsWithText(
  reviews: readonly PlaceReview[],
): readonly (PlaceReview & { readonly text: { readonly text: string } })[] {
  return reviews.filter(
    (r): r is PlaceReview & { readonly text: { readonly text: string } } =>
      Boolean(r.text?.text),
  );
}

function formatReviewQuotes(reviews: readonly PlaceReview[], max = 3): string {
  return reviewsWithText(reviews)
    .slice(0, max)
    .map(
      (r) =>
        `> "${r.text.text}"\n> -- ${r.authorAttribution?.displayName ?? 'A reviewer'}, ${r.relativePublishTimeDescription}`,
    )
    .join('\n\n');
}

async function generateSummary(reviews: readonly PlaceReview[]): Promise<string> {
  try {
    const ai = createGeminiClient();
    const reviewTexts = reviewsWithText(reviews)
      .map((r) => `[${r.rating}/5] ${r.text.text}`)
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Summarize these reviews for a student apartment in 2-3 sentences. Be honest and balanced. Focus on noise, maintenance, management, value.\n\nReviews:\n${reviewTexts}`,
    });

    return response.text ?? 'Summary unavailable.';
  } catch {
    return 'Summary unavailable.';
  }
}

export async function getReviews(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);

  if (!parsed.listing_id && !parsed.address) {
    throw new Error('Provide either a listing_id or address.');
  }

  // AIN-90 Fix 2: prefer an explicit address (no DB round-trip needed) and
  // only resolve via listing_id when no address was given. resolveAddress
  // returns null on a hallucinated/non-existent listing_id — that degrades
  // gracefully below instead of throwing.
  const address =
    parsed.address ??
    (parsed.listing_id ? await resolveAddress(parsed.listing_id, context) : null);

  if (!address) {
    return {
      machineData: {
        address: null,
        rating: null,
        ratingCount: 0,
        reviewSnippets: [],
        summary: null,
      },
      modelContext:
        'Could not resolve that listing to an address, and none was provided. No reviews available.',
      clientBlock: {
        type: 'text' as const,
        content:
          "I couldn't find that listing to look up reviews for. Try giving me the property address or name.",
      },
    };
  }

  // Check API key
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return {
      machineData: {
        address,
        rating: null,
        ratingCount: 0,
        reviewSnippets: [],
        summary: null,
      },
      modelContext: 'Google Places API key not configured. Reviews are currently unavailable.',
      clientBlock: {
        type: 'text' as const,
        content: 'Reviews are currently unavailable. The Google Places API is not configured.',
      },
    };
  }

  // Check cache
  const cacheKey = `reviews:${address}`;
  const cached = await getCached<ToolResult>(context.supabase, cacheKey);
  if (cached) {
    return cached;
  }

  // Find place
  const placeId = await textSearchPlace(`${address}, Madison, WI`, apiKey);
  if (!placeId) {
    return {
      machineData: {
        address,
        rating: null,
        ratingCount: 0,
        reviewSnippets: [],
        summary: null,
      },
      modelContext: `No Google Places listing found for "${address}". No reviews available.`,
      clientBlock: {
        type: 'text' as const,
        content: `No Google Places listing found for this address. Try searching for the property name or management company directly on Google Maps.`,
      },
    };
  }

  // Get place details with reviews
  const details = await getPlaceDetails(
    placeId,
    apiKey,
    'displayName,rating,userRatingCount,reviews',
  );

  const reviews = details.reviews ?? [];
  const rating = details.rating;
  const ratingCount = details.userRatingCount;

  // No reviews case
  if (reviews.length === 0) {
    const ratingInfo = rating
      ? `Google rating: ${rating}/5 (${ratingCount ?? 0} ratings) but no written reviews available.`
      : 'No reviews or ratings found on Google Places.';

    const result: ToolResult = {
      machineData: {
        address,
        rating: rating ?? null,
        ratingCount: ratingCount ?? 0,
        reviewSnippets: [],
        summary: ratingInfo,
      },
      modelContext: `${details.displayName?.text ?? address}: ${ratingInfo}`,
      clientBlock: {
        type: 'text' as const,
        content: ratingInfo,
      },
    };

    await setCache(context.supabase, cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  // Generate summary only if 3+ reviews
  const summary =
    reviews.length >= 3
      ? await generateSummary(reviews)
      : reviewsWithText(reviews)
          .map((r) => `${r.rating}/5: ${r.text.text}`)
          .join(' | ');

  const quotes = formatReviewQuotes(reviews);

  const modelContext = [
    `${details.displayName?.text ?? address} - Google Rating: ${rating}/5 (${ratingCount} ratings)`,
    '',
    `Summary: ${summary}`,
    '',
    'Reviews:',
    ...reviewsWithText(reviews).map(
      (r) =>
        `- [${r.rating}/5] "${r.text.text}" -- ${r.authorAttribution?.displayName ?? 'A reviewer'} (${r.relativePublishTimeDescription})`,
    ),
  ].join('\n');

  const clientContent = [
    `**Google Rating:** ${rating}/5 (${ratingCount} ratings)`,
    '',
    summary,
    '',
    '**Notable reviews:**',
    '',
    quotes,
  ].join('\n');

  const result: ToolResult = {
    machineData: {
      address,
      rating: rating ?? null,
      ratingCount: ratingCount ?? 0,
      reviewSnippets: reviewsWithText(reviews)
        .map((review) => review.text.text)
        .slice(0, 5),
      summary,
    },
    modelContext,
    clientBlock: {
      type: 'text' as const,
      content: clientContent,
    },
  };

  await setCache(context.supabase, cacheKey, result, CACHE_TTL_MS);

  return result;
}
