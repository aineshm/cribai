import { describe, it, expect, vi } from 'vitest';
import { getSavedListings } from '../handlers/get-saved-listings';
import { createMockContext, createMockQueryBuilder, SAMPLE_LISTING_ROW, SAMPLE_LISTING_ROW_2 } from './helpers';

const makeSavedRow = (listing: typeof SAMPLE_LISTING_ROW, createdAt = '2026-03-01T00:00:00Z') => ({
  listing_id: listing.id,
  created_at: createdAt,
  listings: {
    id: listing.id,
    address: listing.address,
    rent_monthly: listing.rent_monthly,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    sqft: listing.sqft,
    fairness_score: listing.fairness_score,
    true_cost_total: listing.true_cost_total,
    amenities: listing.amenities,
  },
});

describe('getSavedListings', () => {
  it('returns sign-in prompt for unauthenticated user', async () => {
    const context = createMockContext({ userId: undefined });

    const result = await getSavedListings({}, context);

    expect(result.modelContext).toContain('not logged in');
    expect(result.clientBlock.type).toBe('text');
    expect((result.clientBlock as { content: string }).content).toContain('sign in');
  });

  it('returns helpful message when no saved listings', async () => {
    const builder = createMockQueryBuilder([]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    const result = await getSavedListings({}, context);

    expect(result.modelContext).toContain('no saved listings');
    expect(result.clientBlock.type).toBe('text');
    expect((result.clientBlock as { content: string }).content).toContain('heart icon');
  });

  it('returns formatted model context and listing_card block with saved listings', async () => {
    const rows = [makeSavedRow(SAMPLE_LISTING_ROW), makeSavedRow(SAMPLE_LISTING_ROW_2)];
    const builder = createMockQueryBuilder(rows);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    const result = await getSavedListings({}, context);

    expect(result.modelContext).toContain('2 saved listing(s)');
    expect(result.modelContext).toContain('123 Langdon St');
    expect(result.modelContext).toContain('456 State St');
    expect(result.clientBlock.type).toBe('listing_card');
    expect((result.clientBlock as { listings: unknown[] }).listings).toHaveLength(2);
  });

  it('sorts results by price ascending when sort=price_asc', async () => {
    // SAMPLE_LISTING_ROW_2 (1400) placed first, SAMPLE_LISTING_ROW (1200) second
    // After price_asc sort the cheaper listing must come first
    const rows = [makeSavedRow(SAMPLE_LISTING_ROW_2), makeSavedRow(SAMPLE_LISTING_ROW)];
    const builder = createMockQueryBuilder(rows);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    const result = await getSavedListings({ sort: 'price_asc' }, context);

    // Sorting is done client-side — PostgREST cannot order on joined foreign-table columns
    const listings = (result.clientBlock as { listings: { rentMonthly: number | null }[] }).listings;
    expect(listings[0]!.rentMonthly).toBe(1200);
    expect(listings[1]!.rentMonthly).toBe(1400);
  });

  it('rejects limit above 20 via zod validation', async () => {
    const context = createMockContext();

    await expect(getSavedListings({ limit: 50 }, context)).rejects.toThrow();
  });

  it('returns graceful error message on supabase error', async () => {
    const builder = createMockQueryBuilder(null, { message: 'connection timeout' });
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    const result = await getSavedListings({}, context);

    expect(result.modelContext).toContain('Error fetching saved listings');
    expect(result.modelContext).toContain('connection timeout');
    expect(result.clientBlock.type).toBe('text');
  });

  it('defaults to limit 10 and saved_date sort', async () => {
    const builder = createMockQueryBuilder([]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    await getSavedListings({}, context);

    expect(builder.limit).toHaveBeenCalledWith(10);
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('queries saved_listings table with user_id filter', async () => {
    const builder = createMockQueryBuilder([]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    await getSavedListings({}, context);

    expect(context.supabase.from).toHaveBeenCalledWith('saved_listings');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'test-user-id');
  });
});
