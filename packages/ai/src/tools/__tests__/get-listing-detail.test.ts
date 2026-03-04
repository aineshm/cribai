import { describe, it, expect, vi } from 'vitest';
import { getListingDetail } from '../handlers/get-listing-detail';
import { createMockContext, createMockQueryBuilder, SAMPLE_LISTING_ROW } from './helpers';

describe('getListingDetail', () => {
  it('returns full listing details with true cost', async () => {
    const builder = createMockQueryBuilder(SAMPLE_LISTING_ROW);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    const result = await getListingDetail(
      { listing_id: '11111111-1111-1111-1111-111111111111' },
      context,
    );

    expect(result.clientBlock.type).toBe('listing_card');
    expect(result.modelContext).toContain('123 Langdon St');
    expect(result.modelContext).toContain('True Cost Breakdown');
    expect(result.modelContext).toContain('Fairness:');
  });

  it('throws on missing listing', async () => {
    const builder = createMockQueryBuilder(null, { message: 'not found' });
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    await expect(
      getListingDetail({ listing_id: '11111111-1111-1111-1111-111111111111' }, context),
    ).rejects.toThrow('Listing not found');
  });

  it('throws on invalid UUID', async () => {
    const context = createMockContext();
    await expect(getListingDetail({ listing_id: 'not-a-uuid' }, context)).rejects.toThrow();
  });

  it('scopes query to campus_id', async () => {
    const builder = createMockQueryBuilder(SAMPLE_LISTING_ROW);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    await getListingDetail({ listing_id: '11111111-1111-1111-1111-111111111111' }, context);

    expect(builder.eq).toHaveBeenCalledWith('campus_id', 'test-campus-id');
  });
});
