import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../src/tools/types';

// Mock @tavily/core to prevent import hang
vi.mock('@tavily/core', () => ({
  tavily: vi.fn(() => ({ search: vi.fn() })),
}));

vi.mock('../src/embeddings/generate-embedding', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock('../src/embeddings/synthesize-text', () => ({
  synthesizeListingText: vi.fn(() => '123 Main St | 2 bed | $1200'),
}));

// Must import after mock setup
import { persistWebListing } from '../src/tools/handlers/web-search';

function createMockSupabase() {
  const upsertSingleFn = vi.fn();
  const upsertSelectFn = vi.fn().mockReturnValue({ single: upsertSingleFn });
  const existingSingleFn = vi.fn().mockResolvedValue({
    data: { last_embedded_at: null },
    error: null,
  });
  const existingEqFn = vi.fn().mockReturnValue({ single: existingSingleFn });
  const existingSelectFn = vi.fn().mockReturnValue({ eq: existingEqFn });
  const upsertFn = vi.fn().mockReturnValue({ select: upsertSelectFn });
  const eqFn = vi.fn().mockResolvedValue({ error: null });
  const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
  const fromFn = vi.fn().mockImplementation((table: string) => {
    if (table === 'listings') {
      return {
        upsert: upsertFn,
        select: existingSelectFn,
        update: updateFn,
      };
    }
    return {};
  });

  return {
    from: fromFn,
    upsertFn,
    upsertSelectFn,
    upsertSingleFn,
    existingSelectFn,
    existingEqFn,
    existingSingleFn,
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
    vi.clearAllMocks();
    mock = createMockSupabase();
    context = createMockContext(mock);
  });

  it('upserts a listing with source=web_search and returns the new listing UUID on success', async () => {
    mock.upsertSingleFn.mockResolvedValue({
      data: { id: 'new-listing-uuid' },
      error: null,
    });

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

  it('embeds a new web listing after successful upsert', async () => {
    mock.upsertSingleFn.mockResolvedValue({
      data: { id: 'new-listing-uuid' },
      error: null,
    });

    await persistWebListing(
      {
        address: '123 Main St',
        sourceUrl: 'https://example.com/listing',
        content: 'Content here',
      },
      context,
    );

    expect(mock.updateFn).toHaveBeenCalledWith({
      embedding: '[0.1,0.2,0.3]',
      embedding_text: '123 Main St | 2 bed | $1200',
      last_embedded_at: expect.any(String),
    });
    expect(mock.eqFn).toHaveBeenCalledWith('id', 'new-listing-uuid');
  });

  it('returns null and does not throw when upsert fails', async () => {
    mock.upsertSingleFn.mockResolvedValue({
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
    mock.upsertSingleFn.mockResolvedValue({
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
    mock.upsertSingleFn.mockResolvedValue({
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
        external_id: 'https://zillow.com/listing/789#456 Campus Dr',
        address: '456 Campus Dr',
        source: 'web_search',
        source_url: 'https://zillow.com/listing/789',
        rent_monthly: 950,
        bedrooms: 1,
        campus_id: 'campus-uuid-123',
        is_active: true,
        raw_data: { web_content: 'Cozy studio apartment' },
      },
      { onConflict: 'external_id,source' },
    );
  });
});
