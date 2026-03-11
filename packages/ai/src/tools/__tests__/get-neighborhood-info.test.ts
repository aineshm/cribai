import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNeighborhoodInfo } from '../handlers/get-neighborhood-info';
import { createMockContext, createMockQueryBuilder } from './helpers';
import type { ToolResult } from '../types';

vi.mock('../lib/walkscore', () => ({
  getWalkScore: vi.fn(),
}));

vi.mock('../lib/google-places', () => ({
  nearbySearch: vi.fn(),
}));

vi.mock('../lib/api-cache', () => ({
  getCached: vi.fn(),
  setCache: vi.fn(),
}));

import { getWalkScore } from '../lib/walkscore';
import { nearbySearch } from '../lib/google-places';
import { getCached, setCache } from '../lib/api-cache';

const mockGetWalkScore = vi.mocked(getWalkScore);
const mockNearbySearch = vi.mocked(nearbySearch);
const mockGetCached = vi.mocked(getCached);
const mockSetCache = vi.mocked(setCache);

const SAMPLE_WALK_SCORE = {
  walkscore: 85,
  description: 'Very Walkable',
  transit: { score: 62, description: 'Excellent Transit' },
  bike: { score: 78, description: 'Very Bikeable' },
};

const SAMPLE_NEARBY_PLACES = [
  {
    displayName: { text: 'Trader Joes' },
    formattedAddress: '123 Main St',
    types: ['grocery_or_supermarket'],
    location: { latitude: 43.07, longitude: -89.40 },
  },
  {
    displayName: { text: 'Starbucks' },
    formattedAddress: '456 State St',
    types: ['cafe'],
    location: { latitude: 43.07, longitude: -89.40 },
  },
  {
    displayName: { text: 'Planet Fitness' },
    formattedAddress: '789 Park St',
    types: ['gym'],
    location: { latitude: 43.07, longitude: -89.40 },
  },
  {
    displayName: { text: 'Chipotle' },
    formattedAddress: '101 University Ave',
    types: ['restaurant'],
    location: { latitude: 43.07, longitude: -89.40 },
  },
] as const;

describe('getNeighborhoodInfo', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      GOOGLE_PLACES_API_KEY: 'test-places-key',
      WALKSCORE_API_KEY: 'test-walkscore-key',
    };
    mockGetCached.mockResolvedValue(null);
    mockSetCache.mockResolvedValue(undefined);
  });

  it('returns Walk Score + nearby amenities when all APIs succeed', async () => {
    const context = createMockContext();
    const builder = createMockQueryBuilder({
      address: '123 Langdon St',
      lat: 43.0766,
      lng: -89.3972,
    });
    (context.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);

    mockGetWalkScore.mockResolvedValue(SAMPLE_WALK_SCORE);
    mockNearbySearch.mockResolvedValue(SAMPLE_NEARBY_PLACES);

    const result = await getNeighborhoodInfo(
      { listing_id: '11111111-1111-1111-1111-111111111111' },
      context,
    );

    expect(result.clientBlock.type).toBe('text');
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('85');
      expect(result.clientBlock.content).toContain('Very Walkable');
      expect(result.clientBlock.content).toContain('Trader Joes');
    }
    expect(result.modelContext).toContain('Walk Score');
    expect(result.modelContext).toContain('Trader Joes');
  });

  it('returns cached result when cache hit', async () => {
    const context = createMockContext();
    const cachedResult: ToolResult = {
      modelContext: 'cached neighborhood data',
      clientBlock: { type: 'text', content: 'cached neighborhood' },
    };
    mockGetCached.mockResolvedValue(cachedResult);

    const result = await getNeighborhoodInfo({ address: '123 Langdon St' }, context);

    expect(result).toEqual(cachedResult);
    expect(mockGetWalkScore).not.toHaveBeenCalled();
    expect(mockNearbySearch).not.toHaveBeenCalled();
  });

  it('handles Walk Score unavailable gracefully (still returns amenities)', async () => {
    const context = createMockContext();
    const builder = createMockQueryBuilder({
      address: '123 Langdon St',
      lat: 43.0766,
      lng: -89.3972,
    });
    (context.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);

    delete process.env.WALKSCORE_API_KEY;
    mockNearbySearch.mockResolvedValue(SAMPLE_NEARBY_PLACES);

    const result = await getNeighborhoodInfo(
      { listing_id: '11111111-1111-1111-1111-111111111111' },
      context,
    );

    expect(result.clientBlock.type).toBe('text');
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('Trader Joes');
      expect(result.clientBlock.content).toContain('unavailable');
    }
    expect(mockGetWalkScore).not.toHaveBeenCalled();
  });

  it('throws when neither listing_id nor address provided', async () => {
    const context = createMockContext();
    await expect(getNeighborhoodInfo({}, context)).rejects.toThrow();
  });

  it('categorizes nearby places by type correctly', async () => {
    const context = createMockContext();
    mockGetWalkScore.mockResolvedValue(SAMPLE_WALK_SCORE);
    mockNearbySearch.mockResolvedValue(SAMPLE_NEARBY_PLACES);

    const result = await getNeighborhoodInfo(
      { address: '123 Langdon St', listing_id: undefined },
      context,
    );

    expect(result.modelContext).toContain('Grocery');
    expect(result.modelContext).toContain('Trader Joes');
    expect(result.modelContext).toContain('Dining');
    expect(result.modelContext).toContain('Starbucks');
    expect(result.modelContext).toContain('Fitness');
    expect(result.modelContext).toContain('Planet Fitness');
  });

  it('caches result with 7-day TTL', async () => {
    const context = createMockContext();
    mockGetWalkScore.mockResolvedValue(SAMPLE_WALK_SCORE);
    mockNearbySearch.mockResolvedValue(SAMPLE_NEARBY_PLACES);

    await getNeighborhoodInfo({ address: '123 Langdon St' }, context);

    expect(mockSetCache).toHaveBeenCalledWith(
      context.supabase,
      'neighborhood:123 Langdon St',
      expect.any(Object),
      604800000,
    );
  });

  it('rejects invalid listing_id', async () => {
    const context = createMockContext();
    await expect(
      getNeighborhoodInfo({ listing_id: 'not-uuid' }, context),
    ).rejects.toThrow();
  });
});
