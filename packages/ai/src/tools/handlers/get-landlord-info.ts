import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';
import { getCached, setCache } from '../lib/api-cache';
import { textSearchPlace, getPlaceDetails } from '../lib/google-places';

const inputSchema = z.object({
  landlord_id: z.string().uuid().optional(),
  listing_id: z.string().uuid().optional(),
  name: z.string().optional(),
});

const CACHE_TTL_MS = 86_400_000; // 24 hours

/**
 * Resolve an address from a listing ID for Google Places lookup.
 */
async function resolveListingAddress(
  listingId: string,
  context: ToolContext,
): Promise<{ address: string; source: string | null } | null> {
  const { data, error } = await context.supabase
    .from('listings')
    .select('address, source')
    .eq('id', listingId)
    .single();

  if (error || !data?.address) return null;
  return { address: data.address as string, source: data.source as string | null };
}

/**
 * Look up landlord/property info via Google Places.
 * Returns rating, review count, and notable reviews.
 */
async function lookupViaGooglePlaces(
  searchQuery: string,
  context: ToolContext,
): Promise<ToolResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return {
      modelContext: 'Google Places API key not configured. Landlord info is currently unavailable.',
      clientBlock: {
        type: 'text' as const,
        content: 'Landlord information is currently unavailable.',
      },
    };
  }

  const cacheKey = `landlord:${searchQuery}`;
  const cached = await getCached<ToolResult>(context.supabase, cacheKey);
  if (cached) return cached;

  const placeId = await textSearchPlace(`${searchQuery}, Madison, WI`, apiKey);
  if (!placeId) {
    return {
      modelContext: `No Google Places listing found for "${searchQuery}". No landlord info available.`,
      clientBlock: {
        type: 'text' as const,
        content: 'No landlord information found for this property. Try asking about a specific property management company by name.',
      },
    };
  }

  const details = await getPlaceDetails(
    placeId,
    apiKey,
    'displayName,rating,userRatingCount,reviews',
  );

  const reviews = details.reviews ?? [];
  const rating = details.rating;
  const ratingCount = details.userRatingCount;
  const placeName = details.displayName.text;

  const modelLines = [`Property: ${placeName}`];

  if (rating) {
    modelLines.push(`Google Rating: ${rating}/5 (${ratingCount ?? 0} ratings)`);
  } else {
    modelLines.push('No Google rating available.');
  }

  if (reviews.length > 0) {
    modelLines.push('');
    modelLines.push('Notable reviews:');
    for (const r of reviews.slice(0, 3)) {
      modelLines.push(`- [${r.rating}/5] "${r.text.text}" — ${r.authorAttribution.displayName} (${r.relativePublishTimeDescription})`);
    }
  }

  const modelContext = modelLines.join('\n');

  const clientLines = [`**${placeName}**`];
  if (rating) {
    clientLines.push(`Google Rating: ${rating}/5 (${ratingCount ?? 0} ratings)`);
  }
  if (reviews.length > 0) {
    clientLines.push('');
    for (const r of reviews.slice(0, 3)) {
      clientLines.push(`> "${r.text.text}"\n> — ${r.authorAttribution.displayName}, ${r.relativePublishTimeDescription}`);
    }
  }

  const result: ToolResult = {
    modelContext,
    clientBlock: {
      type: 'text' as const,
      content: clientLines.join('\n'),
    },
  };

  await setCache(context.supabase, cacheKey, result, CACHE_TTL_MS);
  return result;
}

export async function getLandlordInfo(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);

  if (!parsed.landlord_id && !parsed.listing_id && !parsed.name) {
    throw new Error('Provide a landlord_id, listing_id, or name.');
  }

  // If a name is provided directly, search Google Places for it
  if (parsed.name) {
    return lookupViaGooglePlaces(parsed.name, context);
  }

  // If listing_id provided, resolve address and search Google Places
  if (parsed.listing_id && !parsed.landlord_id) {
    const listing = await resolveListingAddress(parsed.listing_id, context);
    if (!listing) {
      return {
        modelContext: 'Listing not found. Cannot look up landlord information.',
        clientBlock: {
          type: 'text' as const,
          content: 'Could not find the listing to look up landlord information.',
        },
      };
    }
    return lookupViaGooglePlaces(listing.address, context);
  }

  // If landlord_id provided, check our DB first
  const { data: landlord, error } = await context.supabase
    .from('landlords')
    .select('id, name, company, scorecard')
    .eq('id', parsed.landlord_id!)
    .single();

  if (error || !landlord) {
    throw new Error('Landlord not found.');
  }

  // Fetch reviews summary from our DB
  const { data: reviews } = await context.supabase
    .from('landlord_reviews')
    .select('ratings, review_text')
    .eq('landlord_id', parsed.landlord_id!);

  const reviewCount = reviews?.length ?? 0;
  const scorecard = landlord.scorecard as Record<string, number> | null;

  let modelContext = `Landlord: ${landlord.name}${landlord.company ? ` (${landlord.company})` : ''}\n`;

  if (scorecard && Object.keys(scorecard).length > 0) {
    modelContext += `Scorecard: ${Object.entries(scorecard)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}\n`;
  }

  modelContext += `Reviews: ${reviewCount} total`;

  if (reviews && reviews.length > 0) {
    const avgRatings: Record<string, number> = {};
    let count = 0;
    for (const review of reviews) {
      const ratings = review.ratings as Record<string, number>;
      for (const [key, val] of Object.entries(ratings)) {
        avgRatings[key] = (avgRatings[key] ?? 0) + val;
      }
      count++;
    }
    if (count > 0) {
      for (const key of Object.keys(avgRatings)) {
        avgRatings[key] = Math.round((avgRatings[key]! / count) * 10) / 10;
      }
      modelContext += `\nAverage ratings: ${Object.entries(avgRatings)
        .map(([k, v]) => `${k}=${v}/5`)
        .join(', ')}`;
    }
  }

  // Also enrich with Google Places data if the landlord has a company name
  const companyName = landlord.company ?? landlord.name;
  if (companyName) {
    try {
      const placesResult = await lookupViaGooglePlaces(companyName, context);
      modelContext += `\n\nGoogle Places data:\n${placesResult.modelContext}`;
    } catch {
      // Google Places lookup failed — continue with DB data only
    }
  }

  return {
    modelContext,
    clientBlock: {
      type: 'text',
      content: modelContext,
    },
  };
}
