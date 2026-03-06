import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the embedding modules
vi.mock('../synthesize-text', () => ({
  synthesizeListingText: vi.fn().mockReturnValue('synthesized listing text'),
}));

vi.mock('../generate-embedding', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(Array(768).fill(0.1)),
}));

import { embedChangedListings } from '../embed-listings';
import { synthesizeListingText } from '../synthesize-text';
import { generateEmbedding } from '../generate-embedding';

function createMockSupabase(listings: readonly Record<string, unknown>[]) {
  // Build a chainable mock for select queries:
  // from('listings').select(...).eq('is_active', true).or(...)
  const orMock = vi.fn().mockResolvedValue({ data: listings, error: null });
  const eqSelectMock = vi.fn().mockReturnValue({ or: orMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock });

  // Build a chainable mock for update queries:
  // from('listings').update({...}).eq('id', ...)
  const eqUpdateMock = vi.fn().mockResolvedValue({ error: null });
  const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock });

  return {
    from: vi.fn().mockReturnValue({
      select: selectMock,
      update: updateMock,
    }),
  } as unknown as Parameters<typeof embedChangedListings>[0];
}

describe('embedChangedListings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes listings that have never been embedded', async () => {
    const listings = [
      {
        id: 'abc-123',
        address: '123 Test St',
        rent_monthly: 1000,
        bedrooms: 2,
        bathrooms: 1,
        sqft: 800,
        amenities: ['parking'],
        photo_urls: ['url1.jpg'],
        last_embedded_at: null,
        updated_at: '2026-03-05T00:00:00Z',
      },
    ];

    const supabase = createMockSupabase(listings);
    const result = await embedChangedListings(supabase);

    expect(synthesizeListingText).toHaveBeenCalledTimes(1);
    expect(generateEmbedding).toHaveBeenCalledWith('synthesized listing text');
    expect(result.embedded).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('returns zero metrics when no listings need embedding', async () => {
    const supabase = createMockSupabase([]);
    const result = await embedChangedListings(supabase);

    expect(result.embedded).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(synthesizeListingText).not.toHaveBeenCalled();
  });

  it('tracks errors without throwing', async () => {
    const listings = [
      {
        id: 'abc-123',
        address: '123 Test St',
        rent_monthly: 1000,
        bedrooms: 2,
        bathrooms: 1,
        sqft: 800,
        amenities: [],
        photo_urls: [],
        last_embedded_at: null,
        updated_at: '2026-03-05T00:00:00Z',
      },
    ];

    vi.mocked(generateEmbedding).mockRejectedValueOnce(new Error('API error'));

    const supabase = createMockSupabase(listings);
    const result = await embedChangedListings(supabase);

    expect(result.errors).toBe(1);
    expect(result.embedded).toBe(0);
  });

  it('returns metrics object with correct shape', async () => {
    const supabase = createMockSupabase([]);
    const result = await embedChangedListings(supabase);

    expect(result).toHaveProperty('embedded');
    expect(result).toHaveProperty('skipped');
    expect(result).toHaveProperty('errors');
    expect(typeof result.embedded).toBe('number');
    expect(typeof result.skipped).toBe('number');
    expect(typeof result.errors).toBe('number');
  });
});
