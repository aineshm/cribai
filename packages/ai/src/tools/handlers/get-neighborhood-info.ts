import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';
import { getCached, setCache } from '../lib/api-cache';
import { getWalkScore } from '../lib/walkscore';
import { nearbySearch } from '../lib/google-places';
import type { NearbyPlace } from '../lib/google-places';
import type { WalkScoreResult } from '../lib/walkscore';

const inputSchema = z.object({
  address: z.string().optional(),
  listing_id: z.string().uuid().optional(),
  topics: z.array(z.string()).optional(),
});

const CACHE_TTL_MS = 604_800_000; // 7 days

const AMENITY_TYPES = [
  'grocery_or_supermarket',
  'cafe',
  'restaurant',
  'gym',
  'pharmacy',
  'laundry',
] as const;

const TYPE_CATEGORY_MAP: Record<string, string> = {
  grocery_or_supermarket: 'Grocery',
  cafe: 'Dining',
  restaurant: 'Dining',
  gym: 'Fitness',
  pharmacy: 'Health',
  laundry: 'Services',
};

interface ListingLocation {
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
}

async function resolveListingLocation(
  listingId: string,
  context: ToolContext,
): Promise<ListingLocation> {
  const { data, error } = await context.supabase
    .from('listings')
    .select('address, lat, lng')
    .eq('id', listingId)
    .single();

  if (error || !data?.address) {
    throw new Error(`Listing ${listingId} not found or has no address.`);
  }

  return {
    address: data.address as string,
    lat: (data.lat as number) ?? 43.0766,
    lng: (data.lng as number) ?? -89.3972,
  };
}

function categorizePlaces(
  places: readonly NearbyPlace[],
): Record<string, readonly string[]> {
  const categories: Record<string, string[]> = {};

  for (const place of places) {
    const primaryType = place.types?.[0] ?? 'other';
    const category = TYPE_CATEGORY_MAP[primaryType] ?? 'Other';
    const existing = categories[category] ?? [];
    categories[category] = [...existing, place.displayName.text];
  }

  return categories;
}

function formatWalkScoreSection(scores: WalkScoreResult | null): string {
  if (!scores || scores.walkscore === null) {
    return 'Walk Score: unavailable';
  }

  const lines = [`Walk Score: ${scores.walkscore}/100 (${scores.description})`];

  if (scores.transit) {
    lines.push(`Transit Score: ${scores.transit.score}/100 (${scores.transit.description})`);
  }
  if (scores.bike) {
    lines.push(`Bike Score: ${scores.bike.score}/100 (${scores.bike.description})`);
  }

  return lines.join('\n');
}

function formatCategorizedPlaces(categories: Record<string, readonly string[]>): string {
  const lines: string[] = [];

  for (const [category, names] of Object.entries(categories)) {
    lines.push(`${category}: ${names.join(', ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : 'No nearby amenities found.';
}

export async function getNeighborhoodInfo(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);

  if (!parsed.listing_id && !parsed.address) {
    throw new Error('Provide either a listing_id or address.');
  }

  // Resolve location
  let address: string;
  let lat: number;
  let lng: number;

  if (parsed.listing_id) {
    const location = await resolveListingLocation(parsed.listing_id, context);
    address = location.address;
    lat = location.lat;
    lng = location.lng;
  } else {
    address = parsed.address!;
    // Default coords for Madison, WI when only address provided
    lat = 43.0766;
    lng = -89.3972;
  }

  // Check cache
  const cacheKey = `neighborhood:${address}`;
  const cached = await getCached<ToolResult>(context.supabase, cacheKey);
  if (cached) {
    return cached;
  }

  // Get Walk Score (graceful if key missing)
  const walkScoreKey = process.env.WALKSCORE_API_KEY;
  let walkScores: WalkScoreResult | null = null;

  if (walkScoreKey) {
    walkScores = await getWalkScore(address, lat, lng, walkScoreKey);
  }

  // Get nearby amenities
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  let nearbyPlaces: readonly NearbyPlace[] = [];

  if (placesKey) {
    try {
      nearbyPlaces = await nearbySearch(lat, lng, 1000, [...AMENITY_TYPES], placesKey);
    } catch {
      // Graceful degradation -- continue without amenities
    }
  }

  const categories = categorizePlaces(nearbyPlaces);
  const walkScoreSection = formatWalkScoreSection(walkScores);
  const amenitiesSection = formatCategorizedPlaces(categories);

  const modelContext = [
    `Neighborhood info for ${address}:`,
    '',
    'Walk Score:',
    walkScoreSection,
    '',
    'Nearby Amenities (within 1km):',
    amenitiesSection,
  ].join('\n');

  const clientContent = [
    `**Neighborhood: ${address}**`,
    '',
    `**${walkScoreSection.split('\n').join('\n')}**`,
    '',
    '**Nearby Places:**',
    amenitiesSection,
  ].join('\n');

  const result: ToolResult = {
    modelContext,
    clientBlock: {
      type: 'text' as const,
      content: clientContent,
    },
  };

  await setCache(context.supabase, cacheKey, result, CACHE_TTL_MS);

  return result;
}
