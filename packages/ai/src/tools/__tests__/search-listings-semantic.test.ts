import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchListings } from '../handlers/search-listings';
import { createMockContext, createMockQueryBuilder, SAMPLE_LISTING_ROW, SAMPLE_LISTING_ROW_2 } from './helpers';

// Mock the embedding module
vi.mock('../../embeddings/generate-embedding', () => ({
  generateQueryEmbedding: vi.fn(),
}));

// Mock the landmarks module — no landmark resolution by default in existing tests
vi.mock('../landmarks', () => ({
  resolveLandmarkFromQuery: vi.fn().mockResolvedValue(null),
}));

import { generateQueryEmbedding } from '../../embeddings/generate-embedding';
import { resolveLandmarkFromQuery } from '../landmarks';

const MOCK_VECTOR = Array.from({ length: 768 }, (_, i) => i / 768);

const SAMPLE_RPC_RESULT_1 = {
  id: '11111111-1111-1111-1111-111111111111',
  address: '123 Langdon St',
  rent_monthly: 1200,
  bedrooms: 2,
  bathrooms: 1,
  sqft: 800,
  fairness_score: 7.5,
  true_cost_total: 1450,
  amenities: ['parking', 'laundry'],
  photo_urls: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
  latitude: 43.0766,
  longitude: -89.3972,
  similarity: 0.92,
};

const SAMPLE_RPC_RESULT_2 = {
  id: '22222222-2222-2222-2222-222222222222',
  address: '456 State St',
  rent_monthly: 1400,
  bedrooms: 3,
  bathrooms: 1.5,
  sqft: 950,
  fairness_score: 6,
  true_cost_total: 1650,
  amenities: ['laundry'],
  photo_urls: ['https://example.com/photo3.jpg'],
  latitude: 43.0745,
  longitude: -89.3935,
  similarity: 0.85,
};

const SAMPLE_RPC_RESULT_3 = {
  id: '33333333-3333-3333-3333-333333333333',
  address: '789 University Ave',
  rent_monthly: 1100,
  bedrooms: 1,
  bathrooms: 1,
  sqft: 600,
  fairness_score: 8,
  true_cost_total: 1300,
  amenities: ['ac', 'laundry', 'parking'],
  photo_urls: [],
  latitude: 43.0720,
  longitude: -89.4010,
  similarity: 0.78,
};

describe('searchListings semantic search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateQueryEmbedding).mockResolvedValue(MOCK_VECTOR);
  });

  it('calls RPC with semantic_query instead of SQL builder', async () => {
    const context = createMockContext();
    const rpcMock = vi.fn().mockResolvedValue({
      data: [SAMPLE_RPC_RESULT_1, SAMPLE_RPC_RESULT_2, SAMPLE_RPC_RESULT_3],
      error: null,
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    const result = await searchListings(
      { semantic_query: 'quiet place with natural light' },
      context,
    );

    expect(generateQueryEmbedding).toHaveBeenCalledWith('quiet place with natural light');
    expect(rpcMock).toHaveBeenCalledWith('match_listings_semantic', expect.objectContaining({
      query_embedding: expect.any(String),
      p_campus_id: 'test-campus-id',
      match_count: 5,
    }));
    expect(result.clientBlock.type).toBe('listing_card');
  });

  it('uses SQL path when semantic_query is absent (backward compatible)', async () => {
    const builder = createMockQueryBuilder([SAMPLE_LISTING_ROW, SAMPLE_LISTING_ROW_2]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    const result = await searchListings({ bedrooms: 2 }, context);

    expect(generateQueryEmbedding).not.toHaveBeenCalled();
    expect(context.supabase.from).toHaveBeenCalledWith('listings');
    expect(result.clientBlock.type).toBe('listing_card');
  });

  it('returns mapBlock for 3+ semantic results with lat/lng', async () => {
    const context = createMockContext();
    const rpcMock = vi.fn().mockResolvedValue({
      data: [SAMPLE_RPC_RESULT_1, SAMPLE_RPC_RESULT_2, SAMPLE_RPC_RESULT_3],
      error: null,
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    const result = await searchListings(
      { semantic_query: 'quiet place near campus' },
      context,
    );

    expect(result.mapBlock).toBeDefined();
    expect(result.mapBlock?.type).toBe('map');
    if (result.mapBlock?.type === 'map') {
      expect(result.mapBlock.listings).toHaveLength(3);
      expect(result.mapBlock.center.lat).toBeCloseTo(43.0744, 3);
      expect(result.mapBlock.zoom).toBe(14);
      expect(result.mapBlock.listings[0]!.photoUrl).toBe('https://example.com/photo1.jpg');
      // Third result has empty photo_urls, so photoUrl should be null
      expect(result.mapBlock.listings[2]!.photoUrl).toBeNull();
    }
  });

  it('returns mapBlock for 2 semantic results with coordinates (threshold >= 1)', async () => {
    const context = createMockContext();
    const rpcMock = vi.fn().mockResolvedValue({
      data: [SAMPLE_RPC_RESULT_1, SAMPLE_RPC_RESULT_2],
      error: null,
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    const result = await searchListings(
      { semantic_query: 'quiet studio' },
      context,
    );

    expect(result.mapBlock).toBeDefined();
    if (result.mapBlock?.type === 'map') {
      expect(result.mapBlock.listings).toHaveLength(2);
    }
  });

  it('applies amenity filter on top of semantic results', async () => {
    const context = createMockContext();
    const rpcMock = vi.fn().mockResolvedValue({
      data: [SAMPLE_RPC_RESULT_1, SAMPLE_RPC_RESULT_2, SAMPLE_RPC_RESULT_3],
      error: null,
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    const result = await searchListings(
      { semantic_query: 'quiet place', amenities: ['ac'] },
      context,
    );

    // Only result 3 has 'ac' amenity
    if (result.clientBlock.type === 'listing_card') {
      expect(result.clientBlock.listings).toHaveLength(1);
      expect(result.clientBlock.listings[0]!.address).toBe('789 University Ave');
    }
  });

  it('does not include numeric scores in modelContext for semantic results', async () => {
    const context = createMockContext();
    const rpcMock = vi.fn().mockResolvedValue({
      data: [SAMPLE_RPC_RESULT_1],
      error: null,
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    const result = await searchListings(
      { semantic_query: 'cozy apartment' },
      context,
    );

    expect(result.modelContext).not.toContain('0.92');
    expect(result.modelContext).not.toContain('similarity');
    expect(result.modelContext).toContain('123 Langdon St');
    expect(result.modelContext).toContain('$1200/mo');
  });

  it('passes hard filters to RPC alongside semantic_query', async () => {
    const context = createMockContext();
    const rpcMock = vi.fn().mockResolvedValue({
      data: [SAMPLE_RPC_RESULT_1],
      error: null,
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    await searchListings(
      { semantic_query: 'modern apartment', bedrooms: 2, max_rent: 1500, min_fairness: 7 },
      context,
    );

    expect(rpcMock).toHaveBeenCalledWith('match_listings_semantic', expect.objectContaining({
      p_bedrooms: 2,
      p_max_rent: 1500,
      p_min_fairness: 7,
      p_min_rent: null,
    }));
  });

  it('accepts relevance sort option', async () => {
    const builder = createMockQueryBuilder([SAMPLE_LISTING_ROW]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    // relevance sort without semantic_query should still work (falls back to default)
    const result = await searchListings({ sort: 'relevance' }, context);
    expect(result.clientBlock.type).toBe('listing_card');
  });

  it('passes geo params to RPC when landmark is detected', async () => {
    const landmark = {
      name: 'Engineering Hall',
      latitude: 43.0715,
      longitude: -89.4115,
      category: 'academic',
    };
    vi.mocked(resolveLandmarkFromQuery).mockResolvedValueOnce(landmark);

    const context = createMockContext();
    const rpcMock = vi.fn().mockResolvedValue({
      data: [SAMPLE_RPC_RESULT_1],
      error: null,
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    const result = await searchListings(
      { semantic_query: 'apartments near Engineering Hall' },
      context,
    );

    expect(rpcMock).toHaveBeenCalledWith('match_listings_semantic', expect.objectContaining({
      p_latitude: 43.0715,
      p_longitude: -89.4115,
      p_radius_m: 1600,
    }));
    expect(result.modelContext).toContain('Engineering Hall');
    expect(result.modelContext).toContain('Geographic filter');
  });

  it('applies campus center fallback when no landmark and no mapBounds', async () => {
    vi.mocked(resolveLandmarkFromQuery).mockResolvedValueOnce(null);

    const context = createMockContext();
    const rpcMock = vi.fn().mockResolvedValue({
      data: [SAMPLE_RPC_RESULT_1],
      error: null,
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    await searchListings(
      { semantic_query: 'cheap apartments' },
      context,
    );

    const rpcArgs = rpcMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(rpcArgs).toHaveProperty('p_latitude', 43.0731);
    expect(rpcArgs).toHaveProperty('p_longitude', -89.4012);
    expect(rpcArgs).toHaveProperty('p_radius_m', 8000);
  });

  it('skips campus fallback when mapBounds are present', async () => {
    vi.mocked(resolveLandmarkFromQuery).mockResolvedValueOnce(null);

    const context = createMockContext({
      mapBounds: { minLat: 43.0, maxLat: 43.1, minLng: -89.5, maxLng: -89.3 },
    });
    const rpcMock = vi.fn().mockResolvedValue({
      data: [SAMPLE_RPC_RESULT_1],
      error: null,
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    await searchListings(
      { semantic_query: 'cheap apartments' },
      context,
    );

    const rpcArgs = rpcMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(rpcArgs).not.toHaveProperty('p_latitude');
    expect(rpcArgs).not.toHaveProperty('p_longitude');
    expect(rpcArgs).not.toHaveProperty('p_radius_m');
  });

  it('passes p_source=sublease to the semantic RPC (AIN-63 sublease-only discovery)', async () => {
    const context = createMockContext();
    const rpcMock = vi.fn().mockResolvedValue({
      data: [SAMPLE_RPC_RESULT_1],
      error: null,
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    await searchListings({ semantic_query: 'cozy apartment' }, context);

    expect(rpcMock).toHaveBeenCalledWith('match_listings_semantic', expect.objectContaining({
      p_source: 'sublease',
    }));
  });

  it('falls back to the SQL path when the semantic RPC errors (e.g. pre-040 schema, PGRST202)', async () => {
    const builder = createMockQueryBuilder([SAMPLE_LISTING_ROW]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);
    const rpcMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function', code: 'PGRST202', details: null, hint: null },
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    const result = await searchListings({ semantic_query: 'cozy apartment' }, context);

    // Falls back to the (sublease-filtered) SQL builder instead of "temporarily unavailable"
    expect(context.supabase.from).toHaveBeenCalledWith('listings');
    expect(builder.eq).toHaveBeenCalledWith('source', 'sublease');
    expect(result.modelContext).not.toContain('temporarily unavailable');
    if (result.clientBlock.type === 'listing_card') {
      expect(result.clientBlock.listings).toHaveLength(1);
    }
  });

  it('describes semantic results as student subleases, not scraped sources (AIN-63)', async () => {
    const context = createMockContext();
    const rpcMock = vi.fn().mockResolvedValue({
      data: [SAMPLE_RPC_RESULT_1],
      error: null,
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    const result = await searchListings({ semantic_query: 'cozy apartment' }, context);

    expect(result.modelContext).not.toContain('Prefer Zillow-sourced');
    expect(result.modelContext).toContain('student-posted subleases');
  });

  it('centers map on landmark when detected', async () => {
    const landmark = {
      name: 'Engineering Hall',
      latitude: 43.0715,
      longitude: -89.4115,
      category: 'academic',
    };
    vi.mocked(resolveLandmarkFromQuery).mockResolvedValueOnce(landmark);

    const context = createMockContext();
    const rpcMock = vi.fn().mockResolvedValue({
      data: [SAMPLE_RPC_RESULT_1, SAMPLE_RPC_RESULT_2, SAMPLE_RPC_RESULT_3],
      error: null,
    });
    (context.supabase as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    const result = await searchListings(
      { semantic_query: 'apartments near Engineering Hall' },
      context,
    );

    expect(result.mapBlock).toBeDefined();
    if (result.mapBlock?.type === 'map') {
      // Map should center on the landmark, not the average of listings
      expect(result.mapBlock.center.lat).toBe(43.0715);
      expect(result.mapBlock.center.lng).toBe(-89.4115);
    }
  });
});
