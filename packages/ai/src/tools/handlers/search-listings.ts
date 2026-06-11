import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';
import type { ListingSummary } from '@campusnest/types';
import { generateQueryEmbedding } from '../../embeddings/generate-embedding';
import { resolveLandmarkFromQuery } from '../landmarks';

const inputSchema = z.object({
  semantic_query: z.string().optional(),
  address: z.string().optional(),
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

function buildNormalizedArgs(
  parsed: z.infer<typeof inputSchema>,
  limit: number,
): Record<string, unknown> {
  return {
    semantic_query: parsed.semantic_query ?? null,
    address: parsed.address ?? null,
    bedrooms: parsed.bedrooms ?? null,
    min_rent: parsed.min_rent ?? null,
    max_rent: parsed.max_rent ?? null,
    min_fairness: parsed.min_fairness ?? null,
    amenities: parsed.amenities ?? [],
    sort: parsed.sort ?? (parsed.semantic_query ? 'relevance' : 'price_asc'),
    limit,
  };
}

function buildSourceBreakdown(
  listings: readonly ListingSummary[],
): Record<string, number> {
  return listings.reduce<Record<string, number>>((acc, listing) => {
    const source = listing.source ?? 'unknown';
    acc[source] = (acc[source] ?? 0) + 1;
    return acc;
  }, {});
}

function buildSearchStatePatch(
  parsed: z.infer<typeof inputSchema>,
  listings: readonly ListingSummary[],
  generatedAt: string,
): ToolResult['statePatch'] {
  return {
    mode: 'search',
    selectedListingId: null,
    comparedListingIds: [],
    lastSearch: {
      args: buildNormalizedArgs(parsed, parsed.limit ?? 5),
      resultListingIds: listings.map((listing) => listing.id),
      generatedAt,
      source: 'chat_search',
    },
    activeFilters: {
      bedrooms: parsed.bedrooms ?? null,
      minRent: parsed.min_rent ?? null,
      maxRent: parsed.max_rent ?? null,
      amenities: parsed.amenities ?? [],
      address: parsed.address ?? null,
      semanticQuery: parsed.semantic_query ?? null,
      // AIN-63: discovery queries always pin source='sublease'; reflect that in state
      // (not a user-toggleable filter — there is no UI chip for source).
      source: 'sublease',
    },
  };
}

export async function searchListings(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const raw = inputSchema.parse(args);

  // Merge address into semantic_query for vector-based location search.
  // If both are provided, concatenate them. If only address, use it as semantic_query.
  const mergedSemanticQuery = raw.address && raw.semantic_query
    ? `${raw.semantic_query} near ${raw.address}`
    : raw.address ?? raw.semantic_query;

  const parsed = mergedSemanticQuery !== raw.semantic_query
    ? { ...raw, semantic_query: mergedSemanticQuery }
    : raw;

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
  // Resolve landmark from query for geographic proximity filtering
  const landmark = await resolveLandmarkFromQuery(
    parsed.semantic_query!,
    context.campusId,
    context.supabase,
  );

  let queryVector: readonly number[];
  try {
    queryVector = await generateQueryEmbedding(parsed.semantic_query!);
  } catch (err) {
    console.error('[search-listings] embedding generation failed, falling back to SQL:', err);
    return sqlSearch(parsed, limit, context);
  }

  // Default radius: ~1 mile (1600m). Increase for broader landmarks like "State Street"
  const DEFAULT_RADIUS_M = 1600;

  const rpcParams: Record<string, unknown> = {
    query_embedding: JSON.stringify(queryVector),
    p_campus_id: context.campusId,
    p_bedrooms: parsed.bedrooms ?? null,
    p_min_rent: parsed.min_rent ?? null,
    p_max_rent: parsed.max_rent ?? null,
    p_min_fairness: parsed.min_fairness ?? null,
    p_source: 'sublease', // AIN-63: discovery is sublease-only (filtered inside the RPC, migration 040)
    match_count: limit,
  };

  // Add geographic filter when a landmark is detected
  if (landmark) {
    rpcParams.p_latitude = landmark.latitude;
    rpcParams.p_longitude = landmark.longitude;
    rpcParams.p_radius_m = DEFAULT_RADIUS_M;
  }

  // Fallback: scope to campus area when no specific landmark is detected
  // Prevents out-of-area results for generic queries like "2-bedroom under $1200"
  // Skip when mapBounds exist — user has panned the map, so respect their viewport
  if (!landmark && context.campusId && !context.mapBounds) {
    // UW-Madison campus center (also used in MapPanel.tsx DEFAULT_CENTER)
    rpcParams.p_latitude = 43.0731;
    rpcParams.p_longitude = -89.4012;
    rpcParams.p_radius_m = 8000; // ~5 miles — covers all Madison neighborhoods
  }

  const { data, error } = await context.supabase.rpc('match_listings_semantic', rpcParams);

  if (error) {
    console.error('[search-listings] semantic RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      hasLandmark: !!landmark,
      landmarkName: landmark?.name ?? null,
      hasGeoParams: 'p_latitude' in rpcParams,
    });
    // Degrade to the SQL path (already sublease-filtered) instead of an outage message —
    // covers the deploy-before-migration-040 window where the p_source named-arg
    // doesn't match any function signature (PGRST202).
    return sqlSearch(parsed, limit, context);
  }

  let rows = (data ?? []) as readonly SemanticRpcRow[];

  // Apply map viewport bounds filter (client-side since RPC doesn't support it)
  if (context.mapBounds) {
    const BUFFER = 0.005;
    rows = rows.filter(row =>
      row.latitude != null && row.longitude != null &&
      row.latitude >= context.mapBounds!.minLat - BUFFER &&
      row.latitude <= context.mapBounds!.maxLat + BUFFER &&
      row.longitude >= context.mapBounds!.minLng - BUFFER &&
      row.longitude <= context.mapBounds!.maxLng + BUFFER
    );
  }

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
  const geoHint = landmark
    ? `\n[Geographic filter: results within ~1 mile of ${landmark.name} (${landmark.category})]`
    : '';
  const uniqueHint = `\n\n[Unique properties: ${uniqueCount}. If no unique properties matched, consider using web_search to find more options.]`;
  const deepSearchCta = filtered.length > 0
    ? '\n\n[Always end your response by offering: "Want me to run a deep search? I\'ll research reviews, compare prices, and find the best matches for your specific needs."]'
    : '';
  const modelContext = filtered.length === 0
    ? 'No listings found matching the criteria.' + geoHint + uniqueHint
    : `[INTERNAL — do not show listing_id values to the user]\nFound ${filtered.length} listing(s) matching "${parsed.semantic_query}":${geoHint}\n${filtered
        .map(
          (l, i) =>
            `${i + 1}. ${l.address} — $${l.rentMonthly}/mo, ${l.bedrooms ?? '?'} bed, fairness: ${l.fairnessScore ?? 'N/A'}/10 [listing_id:${l.id}]${l.source && l.source !== 'unknown' ? ` (source: ${l.source})` : ''}`,
        )
        .join('\n')}\n\n[All results are student-posted subleases from verified .edu students. Scraped market listings are excluded from discovery and used only as a pricing comp corpus.]` + uniqueHint + deepSearchCta;

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
    row => row.latitude != null && row.longitude != null && (row.latitude !== 0 || row.longitude !== 0),
  );

  const result: ToolResult = {
    machineData: {
      normalizedArgs: buildNormalizedArgs(parsed, limit),
      resultListingIds: filtered.map((listing) => listing.id),
      resultCount: filtered.length,
      uniquePropertyCount: uniqueCount,
      center: rowsWithLatLng.length >= 1
        ? {
            lat: landmark
              ? landmark.latitude
              : rowsWithLatLng.reduce((s, r) => s + (r.latitude ?? 0), 0) / rowsWithLatLng.length,
            lng: landmark
              ? landmark.longitude
              : rowsWithLatLng.reduce((s, r) => s + (r.longitude ?? 0), 0) / rowsWithLatLng.length,
          }
        : null,
      sourceBreakdown: buildSourceBreakdown(filtered),
    },
    modelContext,
    clientBlock: { type: 'listing_card', listings: [...filtered] },
    statePatch: buildSearchStatePatch(parsed, filtered, new Date().toISOString()),
  };

  if (rowsWithLatLng.length >= 1) {
    // Center map on landmark when detected, otherwise average listing positions
    const centerLat = landmark
      ? landmark.latitude
      : rowsWithLatLng.reduce((s, r) => s + (r.latitude ?? 0), 0) / rowsWithLatLng.length;
    const centerLng = landmark
      ? landmark.longitude
      : rowsWithLatLng.reduce((s, r) => s + (r.longitude ?? 0), 0) / rowsWithLatLng.length;

    const mapListings = filteredRows
      .filter(row => row.latitude != null && row.longitude != null && (row.latitude !== 0 || row.longitude !== 0))
      .map(row => {
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
          latitude: row.latitude as number,
          longitude: row.longitude as number,
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
      'id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, true_cost_total, amenities, source, latitude, longitude, photo_urls',
    )
    .eq('campus_id', context.campusId)
    .eq('source', 'sublease')  // AIN-63: discovery surfaces show student subleases only
    .eq('is_active', true)
    .gte('rent_monthly', 200);  // Filter spam listings

  // Apply map viewport bounds as geographic filter (~500m buffer)
  if (context.mapBounds) {
    const BUFFER = 0.005; // ~500m in degrees
    query = query
      .gte('latitude', context.mapBounds.minLat - BUFFER)
      .lte('latitude', context.mapBounds.maxLat + BUFFER)
      .gte('longitude', context.mapBounds.minLng - BUFFER)
      .lte('longitude', context.mapBounds.maxLng + BUFFER);
  }

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
    return {
      machineData: {
        normalizedArgs: buildNormalizedArgs(parsed, limit),
        resultListingIds: [],
        resultCount: 0,
        uniquePropertyCount: 0,
        center: null,
        sourceBreakdown: {},
      },
      modelContext: 'Search is temporarily unavailable. Try rephrasing your request or I can search by specific filters instead.',
      clientBlock: { type: 'listing_card' as const, listings: [] },
    };
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
  const sqlDeepSearchCta = filtered.length > 0
    ? '\n\n[Always end your response by offering: "Want me to run a deep search? I\'ll research reviews, compare prices, and find the best matches for your specific needs."]'
    : '';
  const modelContext = filtered.length === 0
    ? 'No listings found matching the criteria.' + sqlUniqueHint
    : `[INTERNAL — do not show listing_id values to the user]\nFound ${filtered.length} listing(s):\n${filtered
        .map(
          (l, i) =>
            `${i + 1}. ${l.address} — $${l.rentMonthly}/mo, ${l.bedrooms ?? '?'} bed, fairness: ${l.fairnessScore ?? 'N/A'}/10 [listing_id:${l.id}]${l.source && l.source !== 'unknown' ? ` (source: ${l.source})` : ''}`,
        )
        .join('\n')}\n\n[All results are student-posted subleases from verified .edu students. Scraped market listings are excluded from discovery and used only as a pricing comp corpus.]` + sqlUniqueHint + sqlDeepSearchCta;

  const rowsWithCoords = (data ?? []).filter(
    row => row.latitude != null && row.longitude != null && (row.latitude !== 0 || row.longitude !== 0),
  );

  const sqlResult = {
    machineData: {
      normalizedArgs: buildNormalizedArgs(parsed, limit),
      resultListingIds: filtered.map((listing) => listing.id),
      resultCount: filtered.length,
      uniquePropertyCount: sqlUniqueCount,
      center: rowsWithCoords.length >= 1
        ? {
            lat: rowsWithCoords.reduce((s, r) => s + (r.latitude as number), 0) / rowsWithCoords.length,
            lng: rowsWithCoords.reduce((s, r) => s + (r.longitude as number), 0) / rowsWithCoords.length,
          }
        : null,
      sourceBreakdown: buildSourceBreakdown(filtered),
    },
    modelContext,
    clientBlock: { type: 'listing_card' as const, listings: [...filtered] },
    statePatch: buildSearchStatePatch(parsed, filtered, new Date().toISOString()),
  };

  if (rowsWithCoords.length >= 1) {
    const sumLat = rowsWithCoords.reduce((s, r) => s + (r.latitude as number), 0);
    const sumLng = rowsWithCoords.reduce((s, r) => s + (r.longitude as number), 0);
    const centerLat = sumLat / rowsWithCoords.length;
    const centerLng = sumLng / rowsWithCoords.length;

    const mapListings = rowsWithCoords.map(row => {
      const photoUrls = Array.isArray(row.photo_urls) ? row.photo_urls : [];
      return {
        id: row.id as string,
        address: row.address as string,
        rentMonthly: Number(row.rent_monthly),
        bedrooms: row.bedrooms as number | null,
        bathrooms: row.bathrooms as number | null,
        sqft: row.sqft as number | null,
        fairnessScore: row.fairness_score as number | null,
        trueCostTotal: row.true_cost_total as number | null,
        amenities: (row.amenities as string[] | null) ?? [],
        latitude: row.latitude as number,
        longitude: row.longitude as number,
        photoUrl: photoUrls.length > 0 ? (photoUrls[0] as string) : null,
      };
    });

    return {
      ...sqlResult,
      mapBlock: {
        type: 'map' as const,
        listings: mapListings,
        center: { lat: centerLat, lng: centerLng },
        zoom: 14,
      },
    };
  }

  return sqlResult;
}
