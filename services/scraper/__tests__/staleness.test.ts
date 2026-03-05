import { describe, it, expect, vi } from 'vitest';
import { archiveStaleListings } from '../lifecycle';

describe('archiveStaleListings', () => {
  it('inserts into listing_history and deletes from listings for 30+ day stale items', async () => {
    const staleListings = [
      {
        id: 'listing-1',
        campus_id: 'campus-1',
        external_id: 'ext-1',
        source: 'apartments.com',
        address: '123 Main St',
        rent_monthly: 1200,
        first_seen_at: '2026-01-01T00:00:00Z',
        last_seen_at: '2026-01-15T00:00:00Z',
      },
    ];

    // Build a mock with explicit call tracking
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          lt: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });
    const selectFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          lt: vi.fn().mockResolvedValue({ data: staleListings, error: null }),
        }),
      }),
    });

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'listing_history') {
          return { insert: insertFn };
        }
        // listings table - first call select, second call delete
        return {
          select: selectFn,
          delete: deleteFn,
        };
      }),
    };

    const result = await archiveStaleListings(supabase as never, 'campus-1');

    expect(result.archived).toBe(1);
    expect(result.deleted).toBe(1);
    expect(insertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          campus_id: 'campus-1',
          external_id: 'ext-1',
          address: '123 Main St',
          rent_monthly: 1200,
        }),
      ]),
    );
  });

  it('returns zeros when no stale listings found', async () => {
    const selectFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          lt: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: selectFn,
      }),
    };

    const result = await archiveStaleListings(supabase as never, 'campus-1');
    expect(result.archived).toBe(0);
    expect(result.deleted).toBe(0);
  });
});
