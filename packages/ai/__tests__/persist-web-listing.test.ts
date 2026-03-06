import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../src/tools/types';

// Mock @tavily/core to prevent import hang
vi.mock('@tavily/core', () => ({
  tavily: vi.fn(() => ({ search: vi.fn() })),
}));

// Must import after mock setup
import { persistWebListing } from '../src/tools/handlers/web-search';

function createMockSupabase() {
  const singleFn = vi.fn();
  const selectFn = vi.fn().mockReturnValue({ single: singleFn });
  const upsertFn = vi.fn().mockReturnValue({ select: selectFn });
  const eqFn = vi.fn();
  const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
  const fromFn = vi.fn().mockImplementation((table: string) => {
    if (table === 'listings') {
      return {
        upsert: upsertFn,
        update: updateFn,
      };
    }
    return {};
  });

  return {
    from: fromFn,
    upsertFn,
    selectFn,
    singleFn,
    updateFn,
    eqFn,
  };
}

function createMockContext(supabase: { from: ReturnType<typeof vi.fn> }): ToolContext {
  return {
    supabase: supabase as unknown as ToolContext['supabase'],
    campusId: 'campus-uuid-123',
    campusSlug: 'uw-madison',
    userId: 'user-uuid-456',
  };
}

describe('persistWebListing', () => {
  let mock: ReturnType<typeof createMockSupabase>;
  let context: ToolContext;

  beforeEach(() => {
    vi.restoreAllMocks();
    mock = createMockSupabase();
    context = createMockContext(mock);
  });

  it('upserts a listing with source=web_search and returns the new listing UUID on success', async () => {
    mock.singleFn.mockResolvedValue({
      data: { id: 'new-listing-uuid' },
      error: null,
    });
    mock.eqFn.mockResolvedValue({ error: null });

    const result = await persistWebListing(
      {
        address: '123 Main St',
        sourceUrl: 'https://example.com/listing',
        rentMonthly: 1200,
        bedrooms: 2,
        content: 'Great apartment near campus',
      },
      context,
    );

    expect(result).toBe('new-listing-uuid');
  });

  it('sets last_embedded_at to null after successful upsert (triggers embedding pipeline)', async () => {
    mock.singleFn.mockResolvedValue({
      data: { id: 'new-listing-uuid' },
      error: null,
    });
    mock.eqFn.mockResolvedValue({ error: null });

    await persistWebListing(
      {
        address: '123 Main St',
        sourceUrl: 'https://example.com/listing',
        content: 'Content here',
      },
      context,
    );

    expect(mock.updateFn).toHaveBeenCalledWith({ last_embedded_at: null });
    expect(mock.eqFn).toHaveBeenCalledWith('id', 'new-listing-uuid');
  });

  it('returns null and does not throw when upsert fails', async () => {
    mock.singleFn.mockResolvedValue({
      data: null,
      error: { message: 'Database constraint violation' },
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await persistWebListing(
      {
        address: '123 Main St',
        sourceUrl: 'https://example.com/listing',
        content: 'Content here',
      },
      context,
    );

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('returns null when the select-after-upsert returns no data', async () => {
    mock.singleFn.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await persistWebListing(
      {
        address: '123 Main St',
        sourceUrl: 'https://example.com/listing',
        content: 'Content here',
      },
      context,
    );

    expect(result).toBeNull();
  });

  it('passes correct fields to supabase upsert', async () => {
    mock.singleFn.mockResolvedValue({
      data: { id: 'new-listing-uuid' },
      error: null,
    });
    mock.eqFn.mockResolvedValue({ error: null });

    await persistWebListing(
      {
        address: '456 Campus Dr',
        sourceUrl: 'https://zillow.com/listing/789',
        rentMonthly: 950,
        bedrooms: 1,
        content: 'Cozy studio apartment',
      },
      context,
    );

    expect(mock.upsertFn).toHaveBeenCalledWith(
      {
        address: '456 Campus Dr',
        source: 'web_search',
        source_url: 'https://zillow.com/listing/789',
        rent_monthly: 950,
        bedrooms: 1,
        campus_id: 'campus-uuid-123',
        is_active: true,
        raw_data: { web_content: 'Cozy studio apartment' },
      },
      { onConflict: 'source,source_url' },
    );
  });
});
