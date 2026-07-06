import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getReviews } from '../handlers/get-reviews';
import { createMockContext, createMockQueryBuilder } from './helpers';
import type { ToolResult } from '../types';

// Mock dependencies
vi.mock('../lib/google-places', () => ({
  textSearchPlace: vi.fn(),
  getPlaceDetails: vi.fn(),
}));

vi.mock('../lib/api-cache', () => ({
  getCached: vi.fn(),
  setCache: vi.fn(),
}));

vi.mock('../../gemini-client', () => ({
  createGeminiClient: vi.fn(),
}));

import { textSearchPlace, getPlaceDetails } from '../lib/google-places';
import { getCached, setCache } from '../lib/api-cache';
import { createGeminiClient } from '../../gemini-client';

const mockTextSearchPlace = vi.mocked(textSearchPlace);
const mockGetPlaceDetails = vi.mocked(getPlaceDetails);
const mockGetCached = vi.mocked(getCached);
const mockSetCache = vi.mocked(setCache);
const mockCreateGeminiClient = vi.mocked(createGeminiClient);

const SAMPLE_REVIEWS = [
  {
    rating: 5,
    text: { text: 'Great place, very quiet and close to campus.' },
    authorAttribution: { displayName: 'Student A' },
    relativePublishTimeDescription: '2 months ago',
    publishTime: '2026-01-10T00:00:00Z',
  },
  {
    rating: 4,
    text: { text: 'Good value for the price. Maintenance could be faster.' },
    authorAttribution: { displayName: 'Student B' },
    relativePublishTimeDescription: '3 months ago',
    publishTime: '2025-12-15T00:00:00Z',
  },
  {
    rating: 3,
    text: { text: 'Average apartment. Walls are thin but location is excellent.' },
    authorAttribution: { displayName: 'Student C' },
    relativePublishTimeDescription: '5 months ago',
    publishTime: '2025-10-01T00:00:00Z',
  },
] as const;

const MOCK_PLACE_DETAILS = {
  id: 'place-id-123',
  displayName: { text: '123 Langdon St' },
  rating: 4.0,
  userRatingCount: 25,
  reviews: SAMPLE_REVIEWS,
};

function setupGeminiMock(summary = 'This apartment is well-liked by students for its location and quiet environment.') {
  const mockGenerate = vi.fn().mockResolvedValue({
    text: summary,
  });
  mockCreateGeminiClient.mockReturnValue({
    models: { generateContent: mockGenerate },
  } as unknown as ReturnType<typeof createGeminiClient>);
  return mockGenerate;
}

describe('getReviews', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GOOGLE_PLACES_API_KEY: 'test-api-key', GEMINI_API_KEY: 'test-gemini-key' };
    mockGetCached.mockResolvedValue(null);
    mockSetCache.mockResolvedValue(undefined);
  });

  it('returns reviews with Gemini summary when reviews exist', async () => {
    const context = createMockContext();
    mockTextSearchPlace.mockResolvedValue('place-id-123');
    mockGetPlaceDetails.mockResolvedValue(MOCK_PLACE_DETAILS);
    const mockGenerate = setupGeminiMock();

    const result = await getReviews({ address: '123 Langdon St' }, context);

    expect(result.clientBlock.type).toBe('text');
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('Student A');
      expect(result.clientBlock.content).toContain('Student B');
    }
    expect(result.modelContext).toContain('4/5');
    expect(result.modelContext).toContain('25 ratings');
    expect(mockGenerate).toHaveBeenCalled();
  });

  it('resolves address from listing_id via DB when listing_id provided', async () => {
    const context = createMockContext();
    const builder = createMockQueryBuilder({ address: '123 Langdon St' });
    (context.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);
    mockTextSearchPlace.mockResolvedValue('place-id-123');
    mockGetPlaceDetails.mockResolvedValue(MOCK_PLACE_DETAILS);
    setupGeminiMock();

    const result = await getReviews(
      { listing_id: '11111111-1111-1111-1111-111111111111' },
      context,
    );

    expect(builder.select).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', '11111111-1111-1111-1111-111111111111');
    expect(result.clientBlock.type).toBe('text');
  });

  it('throws when neither listing_id nor address provided', async () => {
    const context = createMockContext();
    await expect(getReviews({}, context)).rejects.toThrow();
  });

  it('returns cached result when cache hit', async () => {
    const context = createMockContext();
    const cachedResult: ToolResult = {
      modelContext: 'cached reviews data',
      clientBlock: { type: 'text', content: 'cached reviews' },
    };
    mockGetCached.mockResolvedValue(cachedResult);

    const result = await getReviews({ address: '123 Langdon St' }, context);

    expect(result).toEqual(cachedResult);
    expect(mockTextSearchPlace).not.toHaveBeenCalled();
  });

  it('caches result with 24h TTL after fetching', async () => {
    const context = createMockContext();
    mockTextSearchPlace.mockResolvedValue('place-id-123');
    mockGetPlaceDetails.mockResolvedValue(MOCK_PLACE_DETAILS);
    setupGeminiMock();

    await getReviews({ address: '123 Langdon St' }, context);

    expect(mockSetCache).toHaveBeenCalledWith(
      context.supabase,
      'reviews:123 Langdon St',
      expect.any(Object),
      86400000,
    );
  });

  it('returns empty state when no Google Places listing found', async () => {
    const context = createMockContext();
    mockTextSearchPlace.mockResolvedValue(null);

    const result = await getReviews({ address: '999 Nowhere St' }, context);

    expect(result.clientBlock.type).toBe('text');
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('No Google Places');
    }
    expect(result.modelContext).toContain('No Google Places');
  });

  it('returns empty state when no reviews found but has rating', async () => {
    const context = createMockContext();
    mockTextSearchPlace.mockResolvedValue('place-id-123');
    mockGetPlaceDetails.mockResolvedValue({
      ...MOCK_PLACE_DETAILS,
      reviews: [],
      rating: 3.8,
      userRatingCount: 5,
    });

    const result = await getReviews({ address: '123 Langdon St' }, context);

    expect(result.clientBlock.type).toBe('text');
    expect(result.modelContext).toContain('3.8');
  });

  it('handles missing GOOGLE_PLACES_API_KEY gracefully', async () => {
    const context = createMockContext();
    delete process.env.GOOGLE_PLACES_API_KEY;

    const result = await getReviews({ address: '123 Langdon St' }, context);

    expect(result.clientBlock.type).toBe('text');
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('unavailable');
    }
  });

  it('skips Gemini summary when fewer than 3 reviews', async () => {
    const context = createMockContext();
    mockTextSearchPlace.mockResolvedValue('place-id-123');
    mockGetPlaceDetails.mockResolvedValue({
      ...MOCK_PLACE_DETAILS,
      reviews: SAMPLE_REVIEWS.slice(0, 2),
    });
    const mockGenerate = setupGeminiMock();

    const result = await getReviews({ address: '123 Langdon St' }, context);

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.clientBlock.type).toBe('text');
  });

  it('rejects invalid listing_id', async () => {
    const context = createMockContext();
    await expect(
      getReviews({ listing_id: 'not-a-uuid' }, context),
    ).rejects.toThrow();
  });

  // AIN-90 Fix 1 — Google Places API (New) marks reviews[].text,
  // authorAttribution, and place displayName as OPTIONAL. A prod incident
  // ("Trinity Place") crashed with "Cannot read properties of undefined
  // (reading 'text')" because the handler assumed these were always present.
  describe('AIN-90 Fix 1 — optional review fields', () => {
    it('excludes a rating-only review (no text) from quotes/snippets but keeps the Google rating aggregate intact', async () => {
      const context = createMockContext();
      mockTextSearchPlace.mockResolvedValue('place-id-123');
      const ratingOnlyReview = {
        rating: 2,
        relativePublishTimeDescription: '1 week ago',
        publishTime: '2026-06-01T00:00:00Z',
        // deliberately no `text`, no `authorAttribution` — Google marks both OPTIONAL
      };
      mockGetPlaceDetails.mockResolvedValue({
        ...MOCK_PLACE_DETAILS,
        reviews: [SAMPLE_REVIEWS[0], ratingOnlyReview, SAMPLE_REVIEWS[1]],
        rating: 4.0,
        userRatingCount: 25,
      } as unknown as Awaited<ReturnType<typeof getPlaceDetails>>);
      setupGeminiMock();

      const result = await getReviews({ address: '123 Langdon St' }, context);

      // Did not throw (implicit — we got here), and the well-formed shape holds.
      expect(result.clientBlock.type).toBe('text');
      const machineData = result.machineData as {
        rating: number | null;
        ratingCount: number;
        reviewSnippets: readonly string[];
      };
      // Google's own aggregate already reflects the rating-only review —
      // it passes through unfiltered.
      expect(machineData.rating).toBe(4.0);
      expect(machineData.ratingCount).toBe(25);
      // Only the 2 reviews with real text are quotable.
      expect(machineData.reviewSnippets).toHaveLength(2);
      expect(machineData.reviewSnippets).not.toContain(undefined);
      if (result.clientBlock.type === 'text') {
        expect(result.clientBlock.content).not.toContain('undefined');
      }
      expect(result.modelContext).not.toContain('undefined');
    });

    it('falls back to the queried address when place displayName is missing', async () => {
      const context = createMockContext();
      mockTextSearchPlace.mockResolvedValue('place-id-123');
      mockGetPlaceDetails.mockResolvedValue({
        ...MOCK_PLACE_DETAILS,
        displayName: undefined,
        reviews: [],
      } as unknown as Awaited<ReturnType<typeof getPlaceDetails>>);

      const result = await getReviews({ address: '123 Langdon St' }, context);

      expect(result.clientBlock.type).toBe('text');
      expect(result.modelContext).toContain('123 Langdon St');
    });

    it("falls back to 'A reviewer' when authorAttribution is missing on a review", async () => {
      const context = createMockContext();
      mockTextSearchPlace.mockResolvedValue('place-id-123');
      const noAuthorReview = {
        ...SAMPLE_REVIEWS[0],
        authorAttribution: undefined,
      };
      mockGetPlaceDetails.mockResolvedValue({
        ...MOCK_PLACE_DETAILS,
        reviews: [noAuthorReview, SAMPLE_REVIEWS[1]],
      } as unknown as Awaited<ReturnType<typeof getPlaceDetails>>);
      setupGeminiMock();

      const result = await getReviews({ address: '123 Langdon St' }, context);

      expect(result.clientBlock.type).toBe('text');
      if (result.clientBlock.type === 'text') {
        expect(result.clientBlock.content).toContain('A reviewer');
      }
      expect(result.modelContext).toContain('A reviewer');
    });
  });

  // AIN-90 Fix 2 — a hallucinated/non-existent listing_id must degrade
  // gracefully instead of crashing or throwing a raw DB-not-found error.
  describe('AIN-90 Fix 2 — non-resolving listing_id', () => {
    const ALL_ZEROS_UUID = '00000000-0000-0000-0000-000000000000';

    it('falls back to the provided address when the listing_id does not resolve (regression pin)', async () => {
      const context = createMockContext();
      const builder = createMockQueryBuilder(null, null);
      (context.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);
      mockTextSearchPlace.mockResolvedValue('place-id-123');
      mockGetPlaceDetails.mockResolvedValue(MOCK_PLACE_DETAILS);
      setupGeminiMock();

      await expect(
        getReviews(
          { listing_id: ALL_ZEROS_UUID, address: 'Trinity Place, Madison, WI' },
          context,
        ),
      ).resolves.not.toThrow();

      const result = await getReviews(
        { listing_id: ALL_ZEROS_UUID, address: 'Trinity Place, Madison, WI' },
        context,
      );

      expect(mockTextSearchPlace).toHaveBeenCalledWith(
        expect.stringContaining('Trinity Place, Madison, WI'),
        expect.any(String),
      );
      expect(result.clientBlock.type).toBe('text');
    });

    it('degrades gracefully (no throw) when listing_id does not resolve and no address is given', async () => {
      const context = createMockContext();
      const builder = createMockQueryBuilder(null, null);
      (context.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);

      const result = await getReviews({ listing_id: ALL_ZEROS_UUID }, context);

      expect(result.clientBlock.type).toBe('text');
      // No address ever became available, so the Places API was never queried.
      expect(mockTextSearchPlace).not.toHaveBeenCalled();
    });
  });
});
