import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';
import type { ListingSummary } from '@campusnest/types';
import { generateQueryEmbedding } from '../../embeddings/generate-embedding';

const inputSchema = z.object({
  semantic_query: z.string().optional(),
  bedrooms: z.number().int().min(0).max(10).optional(),
  min_rent: z.number().min(0).optional(),
  max_rent: z.number().min(0).optional(),
  min_fairness: z.number().min(1).max(10).optional(),
  amenities: z.array(z.string()).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'fairness', 'relevance']).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

interface SemanticRpcRow {
  readonly id: string;
  readonly address: string;
  readonly rent_monthly: number;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly fairness_score: number | null;
  readonly true_cost_total: number | null;
  readonly amenities: readonly string[] | null;
  readonly photo_urls: readonly string[] | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly similarity: number;
  readonly source: string | null;
}

export async function searchListings(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);
  const limit = parsed.limit ?? 5;

  // Semantic search path: use vector similarity via RPC
  if (parsed.semantic_query) {
    return semanticSearch(parsed, limit, context);
  }

  // SQL-only path (existing behavior)
  return sqlSearch(parsed, limit, context);
}

async function semanticSearch(
  parsed: z.infer<typeof inputSchema>,
  limit: number,
  context: ToolContext,
): Promise<ToolResult> {
  const queryVector = await generateQueryEmbedding(parsed.semantic_query!);

  const { data, error } = await context.supabase.rpc('match_listings_semantic', {
    query_embedding: JSON.stringify(queryVector),
    p_campus_id: context.campusId,
    p_bedrooms: parsed.bedrooms ?? null,
    p_min_rent: parsed.min_rent ?? null,
    p_max_rent: parsed.max_rent ?? null,
    p_min_fairness: parsed.min_fairness ?? null,
    match_count: limit,
  });

  if (error) {
    throw new Error(`Semantic search failed: ${error.message}`);
  }

  const rows = (data ?? []) as readonly SemanticRpcRow[];

  // Map RPC results to ListingSummary (already sorted by similarity)
  const listings: readonly ListingSummary[] = rows.map(row => ({
    id: row.id,
    address: row.address,
    rentMonthly: Number(row.rent_monthly),
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    sqft: row.sqft,
    fairnessScore: row.fairness_score,
    trueCostTotal: row.true_cost_total,
    amenities: Array.isArray(row.amenities) ? [...row.amenities] : [],
    campusSlug: context.campusSlug,
    source: row.source ?? undefined,
  }));

  // Apply client-side amenity filter
  const filtered = parsed.amenities?.length
    ? listings.filter(l => {
        const lowerAmenities = l.amenities.map((a: string) => a.toLowerCase());
        return parsed.amenities!.every((req: string) =>
          lowerAmenities.some((a: string) => a.includes(req.toLowerCase())),
        );
      })
    : listings;

  // Count unique properties by normalized address
  const uniqueAddresses = new Set(
    filtered.map(l => l.address.toLowerCase().trim()),
  );
  const uniqueCount = uniqueAddresses.size;

  // Build modelContext WITHOUT numeric similarity scores
  const uniqueHint = `\n\n[Unique properties: ${uniqueCount}. If fewer than 1 unique property matched, consider using web_search to find more options.]`;
  const modelContext = filtered.length === 0
    ? 'No listings found matching the criteria.' + uniqueHint
    : `Found ${filtered.length} listing(s) matching "${parsed.semantic_query}":\n${filtered
        .map(
          (l, i) =>
            `${i + 1}. ${l.address} — $${l.rentMonthly}/mo, ${l.bedrooms ?? '?'} bed, fairness: ${l.fairnessScore ?? 'N/A'}/10`,
        )
        .join('\n')}` + uniqueHint;

  // Build map block for 3+ results with lat/lng
  const filteredRows = parsed.amenities?.length
    ? rows.filter(row => {
        const amenities = Array.isArray(row.amenities) ? row.amenities : [];
        const lowerAmenities = amenities.map((a: string) => a.toLowerCase());
        return parsed.amenities!.every((req: string) =>
          lowerAmenities.some((a: string) => a.includes(req.toLowerCase())),
        );
      })
    : rows;

  const rowsWithLatLng = filteredRows.filter(
    row => row.latitude !== null && row.longitude !== null,
  );

  const result: ToolResult = {
    modelContext,
    clientBlock: { type: 'listing_card', listings: [...filtered] },
  };

  if (rowsWithLatLng.length >= 3) {
    const sumLat = rowsWithLatLng.reduce((s, r) => s + (r.latitude ?? 0), 0);
    const sumLng = rowsWithLatLng.reduce((s, r) => s + (r.longitude ?? 0), 0);
    const centerLat = sumLat / rowsWithLatLng.length;
    const centerLng = sumLng / rowsWithLatLng.length;

    const mapListings = filteredRows.map(row => {
      const photoUrls = Array.isArray(row.photo_urls) ? row.photo_urls : [];
      return {
        id: row.id,
        address: row.address,
        rentMonthly: Number(row.rent_monthly),
        bedrooms: row.bedrooms,
        bathrooms: row.bathrooms,
        sqft: row.sqft,
        fairnessScore: row.fairness_score,
        trueCostTotal: row.true_cost_total,
        amenities: Array.isArray(row.amenities) ? [...row.amenities] : [],
        latitude: row.latitude ?? 0,
        longitude: row.longitude ?? 0,
        photoUrl: photoUrls.length > 0 ? (photoUrls[0] as string) : null,
      };
    });

    return {
      ...result,
      mapBlock: {
        type: 'map' as const,
        listings: mapListings,
        center: { lat: centerLat, lng: centerLng },
        zoom: 14,
      },
    };
  }

  return result;
}

async function sqlSearch(
  parsed: z.infer<typeof inputSchema>,
  limit: number,
  context: ToolContext,
): Promise<ToolResult> {
  let query = context.supabase
    .from('listings')
    .select(
      'id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, true_cost_total, amenities, source',
    )
    .eq('campus_id', context.campusId)
    .eq('is_active', true);

  if (parsed.bedrooms !== undefined) {
    if (parsed.bedrooms >= 4) {
      query = query.gte('bedrooms', 4);
    } else {
      query = query.eq('bedrooms', parsed.bedrooms);
    }
  }

  if (parsed.min_rent !== undefined) {
    query = query.gte('rent_monthly', parsed.min_rent);
  }

  if (parsed.max_rent !== undefined) {
    query = query.lte('rent_monthly', parsed.max_rent);
  }

  if (parsed.min_fairness !== undefined) {
    query = query.gte('fairness_score', parsed.min_fairness);
  }

  switch (parsed.sort) {
    case 'price_desc':
      query = query.order('rent_monthly', { ascending: false });
      break;
    case 'fairness':
      query = query.order('fairness_score', { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order('rent_monthly', { ascending: true });
  }

  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  const listings: readonly ListingSummary[] = (data ?? []).map(row => ({
    id: row.id as string,
    address: row.address as string,
    rentMonthly: Number(row.rent_monthly),
    bedrooms: row.bedrooms as number | null,
    bathrooms: row.bathrooms as number | null,
    sqft: row.sqft as number | null,
    fairnessScore: row.fairness_score as number | null,
    trueCostTotal: row.true_cost_total as number | null,
    amenities: (row.amenities as string[] | null) ?? [],
    campusSlug: context.campusSlug,
    source: (row.source as string | null) ?? undefined,
  }));

  // Filter by amenities client-side (jsonb contains is tricky)
  const filtered = parsed.amenities?.length
    ? listings.filter(l => {
        const lowerAmenities = l.amenities.map((a: string) => a.toLowerCase());
        return parsed.amenities!.every((req: string) =>
          lowerAmenities.some((a: string) => a.includes(req.toLowerCase())),
        );
      })
    : listings;

  // Count unique properties by normalized address
  const sqlUniqueAddresses = new Set(
    filtered.map(l => l.address.toLowerCase().trim()),
  );
  const sqlUniqueCount = sqlUniqueAddresses.size;

  const sqlUniqueHint = `\n\n[Unique properties: ${sqlUniqueCount}. If fewer than 1 unique property matched, consider using web_search to find more options.]`;
  const modelContext = filtered.length === 0
    ? 'No listings found matching the criteria.' + sqlUniqueHint
    : `Found ${filtered.length} listing(s):\n${filtered
        .map(
          (l, i) =>
            `${i + 1}. ${l.address} — $${l.rentMonthly}/mo, ${l.bedrooms ?? '?'} bed, fairness: ${l.fairnessScore ?? 'N/A'}/10`,
        )
        .join('\n')}` + sqlUniqueHint;

  return {
    modelContext,
    clientBlock: { type: 'listing_card', listings: [...filtered] },
  };
}
