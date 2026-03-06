import { describe, it, expect, vi } from 'vitest';
import {
  detectPriceChanges,
  createPriceChangeNotifications,
} from '../price-change-detector';
import type { NormalizedListing } from '../normalizer';

function makeListing(
  overrides: Partial<NormalizedListing> = {},
): NormalizedListing {
  return {
    externalId: 'ext-1',
    source: 'craigslist',
    address: '123 Main St',
    rentMonthly: 1200,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 800,
    amenities: [],
    availableDate: null,
    latitude: null,
    longitude: null,
    rawData: {},
    photoUrls: [],
    sourceUrl: 'https://example.com',
    ...overrides,
  };
}

function mockSupabase(responses: Record<string, unknown>) {
  const mock = {
    from: vi.fn((table: string) => {
      const tableResponses = (responses as Record<string, unknown>)[table] ?? {
        data: null,
      };
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue(tableResponses),
          }),
          in: vi.fn().mockResolvedValue(tableResponses),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
  };
  return mock as unknown;
}

describe('detectPriceChanges', () => {
  it('returns empty when no priced rows', async () => {
    const supabase = mockSupabase({});
    const result = await detectPriceChanges(
      supabase as never,
      'campus-1',
      'uw-madison',
      [makeListing({ rentMonthly: null })],
    );
    expect(result).toEqual([]);
  });

  it('returns empty when no existing listings match', async () => {
    const supabase = mockSupabase({
      listings: { data: [] },
    });
    const result = await detectPriceChanges(
      supabase as never,
      'campus-1',
      'uw-madison',
      [makeListing({ rentMonthly: 1200 })],
    );
    expect(result).toEqual([]);
  });

  it('detects price increase', async () => {
    const supabase = mockSupabase({
      listings: {
        data: [
          {
            id: 'listing-uuid',
            external_id: 'ext-1',
            source: 'craigslist',
            rent_monthly: 1000,
            address: '123 Main St',
          },
        ],
      },
    });
    const result = await detectPriceChanges(
      supabase as never,
      'campus-1',
      'uw-madison',
      [makeListing({ externalId: 'ext-1', source: 'craigslist', rentMonthly: 1200 })],
    );
    expect(result).toEqual([
      {
        listingId: 'listing-uuid',
        address: '123 Main St',
        campusSlug: 'uw-madison',
        oldPrice: 1000,
        newPrice: 1200,
      },
    ]);
  });

  it('detects price decrease', async () => {
    const supabase = mockSupabase({
      listings: {
        data: [
          {
            id: 'listing-uuid',
            external_id: 'ext-1',
            source: 'craigslist',
            rent_monthly: 1500,
            address: '456 Oak Ave',
          },
        ],
      },
    });
    const result = await detectPriceChanges(
      supabase as never,
      'campus-1',
      'uw-madison',
      [makeListing({ externalId: 'ext-1', source: 'craigslist', rentMonthly: 1200 })],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.oldPrice).toBe(1500);
    expect(result[0]!.newPrice).toBe(1200);
  });

  it('ignores same-price listings', async () => {
    const supabase = mockSupabase({
      listings: {
        data: [
          {
            id: 'listing-uuid',
            external_id: 'ext-1',
            source: 'craigslist',
            rent_monthly: 1200,
            address: '123 Main St',
          },
        ],
      },
    });
    const result = await detectPriceChanges(
      supabase as never,
      'campus-1',
      'uw-madison',
      [makeListing({ externalId: 'ext-1', source: 'craigslist', rentMonthly: 1200 })],
    );
    expect(result).toEqual([]);
  });

  it('ignores listings with null current rent', async () => {
    const supabase = mockSupabase({
      listings: {
        data: [
          {
            id: 'listing-uuid',
            external_id: 'ext-1',
            source: 'craigslist',
            rent_monthly: null,
            address: '123 Main St',
          },
        ],
      },
    });
    const result = await detectPriceChanges(
      supabase as never,
      'campus-1',
      'uw-madison',
      [makeListing({ externalId: 'ext-1', source: 'craigslist', rentMonthly: 1200 })],
    );
    expect(result).toEqual([]);
  });
});

describe('createPriceChangeNotifications', () => {
  it('returns 0 for empty changes', async () => {
    const supabase = mockSupabase({});
    const result = await createPriceChangeNotifications(
      supabase as never,
      [],
    );
    expect(result).toBe(0);
  });

  it('creates notifications per saved user', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'saved_listings') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { user_id: 'user-1', listing_id: 'listing-1' },
                  { user_id: 'user-2', listing_id: 'listing-1' },
                ],
              }),
            }),
          };
        }
        return { insert: insertMock };
      }),
    };

    const result = await createPriceChangeNotifications(
      supabase as never,
      [
        {
          listingId: 'listing-1',
          address: '123 Main St',
          campusSlug: 'uw-madison',
          oldPrice: 1200,
          newPrice: 1100,
        },
      ],
    );

    expect(result).toBe(2);
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 'user-1',
          listing_id: 'listing-1',
          type: 'price_change',
          payload: expect.objectContaining({
            old_price: 1200,
            new_price: 1100,
            change_pct: -8.3,
          }),
        }),
        expect.objectContaining({
          user_id: 'user-2',
          listing_id: 'listing-1',
        }),
      ]),
    );
  });

  it('handles listings with no saves gracefully', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'saved_listings') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [] }),
            }),
          };
        }
        return { insert: vi.fn() };
      }),
    };

    const result = await createPriceChangeNotifications(
      supabase as never,
      [
        {
          listingId: 'listing-1',
          address: '123 Main St',
          campusSlug: 'uw-madison',
          oldPrice: 1200,
          newPrice: 1300,
        },
      ],
    );

    expect(result).toBe(0);
  });
});
