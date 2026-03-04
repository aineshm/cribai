import { describe, it, expect, vi } from 'vitest';
import { compareListings } from '../handlers/compare-listings';
import { createMockContext, createMockQueryBuilder, SAMPLE_LISTING_ROW, SAMPLE_LISTING_ROW_2 } from './helpers';

describe('compareListings', () => {
  it('returns comparison of 2 listings', async () => {
    const builder = createMockQueryBuilder([SAMPLE_LISTING_ROW, SAMPLE_LISTING_ROW_2]);
    // Make all chainable methods also thenable (like real Supabase query builder)
    const thenableResult = { data: [SAMPLE_LISTING_ROW, SAMPLE_LISTING_ROW_2], error: null };
    const thenableBuilder = {
      ...builder,
      then: (resolve: (v: unknown) => void) => resolve(thenableResult),
    };
    builder.in.mockReturnValue(thenableBuilder);
    builder.eq.mockReturnValue(thenableBuilder);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    const result = await compareListings(
      {
        listing_ids: [
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
        ],
      },
      context,
    );

    expect(result.clientBlock.type).toBe('comparison');
    if (result.clientBlock.type === 'comparison') {
      expect(result.clientBlock.listings).toHaveLength(2);
    }
    expect(result.modelContext).toContain('Comparison of 2 listings');
  });

  it('throws when fewer than 2 listing_ids provided', async () => {
    const context = createMockContext();
    await expect(
      compareListings({ listing_ids: ['11111111-1111-1111-1111-111111111111'] }, context),
    ).rejects.toThrow();
  });

  it('throws when more than 4 listing_ids provided', async () => {
    const context = createMockContext();
    await expect(
      compareListings({
        listing_ids: [
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
          '44444444-4444-4444-4444-444444444444',
          '55555555-5555-5555-5555-555555555555',
        ],
      }, context),
    ).rejects.toThrow();
  });

  it('throws when fewer than 2 valid listings found', async () => {
    const builder = createMockQueryBuilder([SAMPLE_LISTING_ROW]);
    const thenableResult = { data: [SAMPLE_LISTING_ROW], error: null };
    const thenableBuilder = {
      ...builder,
      then: (resolve: (v: unknown) => void) => resolve(thenableResult),
    };
    builder.in.mockReturnValue(thenableBuilder);
    builder.eq.mockReturnValue(thenableBuilder);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    await expect(
      compareListings({
        listing_ids: [
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
        ],
      }, context),
    ).rejects.toThrow('Need at least 2 valid listings');
  });
});
