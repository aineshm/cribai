import { describe, it, expect, vi } from 'vitest';
import { searchListings } from '../handlers/search-listings';
import { createMockContext, createMockQueryBuilder, SAMPLE_LISTING_ROW, SAMPLE_LISTING_ROW_2 } from './helpers';

describe('searchListings', () => {
  it('returns listings matching basic query', async () => {
    const builder = createMockQueryBuilder([SAMPLE_LISTING_ROW, SAMPLE_LISTING_ROW_2]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    const result = await searchListings({}, context);

    expect(result.clientBlock.type).toBe('listing_card');
    if (result.clientBlock.type === 'listing_card') {
      expect(result.clientBlock.listings).toHaveLength(2);
      expect(result.clientBlock.listings[0]!.address).toBe('123 Langdon St');
    }
    expect(result.modelContext).toContain('Found 2 listing(s)');
  });

  it('applies bedroom filter', async () => {
    const builder = createMockQueryBuilder([SAMPLE_LISTING_ROW]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    await searchListings({ bedrooms: 2 }, context);

    expect(builder.eq).toHaveBeenCalledWith('bedrooms', 2);
  });

  it('applies 4+ bedrooms as gte filter', async () => {
    const builder = createMockQueryBuilder([]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    await searchListings({ bedrooms: 4 }, context);

    expect(builder.gte).toHaveBeenCalledWith('bedrooms', 4);
  });

  it('applies rent range filters', async () => {
    const builder = createMockQueryBuilder([]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    await searchListings({ min_rent: 800, max_rent: 1500 }, context);

    expect(builder.gte).toHaveBeenCalledWith('rent_monthly', 800);
    expect(builder.lte).toHaveBeenCalledWith('rent_monthly', 1500);
  });

  it('applies fairness filter', async () => {
    const builder = createMockQueryBuilder([]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    await searchListings({ min_fairness: 7 }, context);

    expect(builder.gte).toHaveBeenCalledWith('fairness_score', 7);
  });

  it('filters by amenities client-side', async () => {
    const builder = createMockQueryBuilder([
      { ...SAMPLE_LISTING_ROW, amenities: ['parking', 'laundry'] },
      { ...SAMPLE_LISTING_ROW_2, amenities: ['laundry'] },
    ]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    const result = await searchListings({ amenities: ['parking'] }, context);

    if (result.clientBlock.type === 'listing_card') {
      expect(result.clientBlock.listings).toHaveLength(1);
      expect(result.clientBlock.listings[0]!.address).toBe('123 Langdon St');
    }
  });

  it('returns empty result message when no listings found', async () => {
    const builder = createMockQueryBuilder([]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    const result = await searchListings({}, context);

    expect(result.modelContext).toBe('No listings found matching the criteria.');
    if (result.clientBlock.type === 'listing_card') {
      expect(result.clientBlock.listings).toHaveLength(0);
    }
  });

  it('respects limit parameter', async () => {
    const builder = createMockQueryBuilder([]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    await searchListings({ limit: 3 }, context);

    expect(builder.limit).toHaveBeenCalledWith(3);
  });

  it('throws on invalid input', async () => {
    const context = createMockContext();
    await expect(searchListings({ bedrooms: 'invalid' }, context)).rejects.toThrow();
  });
});
