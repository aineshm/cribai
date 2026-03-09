import { describe, it, expect } from 'vitest';
import { getReviews } from '../handlers/get-reviews';
import { createMockContext } from './helpers';

describe('getReviews', () => {
  it('returns coming soon message with no args', async () => {
    const context = createMockContext();
    const result = await getReviews({}, context);

    expect(result.clientBlock.type).toBe('text');
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('coming soon');
    }
    expect(result.modelContext).toContain('coming soon');
    expect(result.modelContext).toContain('Reddit');
    expect(result.modelContext).toContain('Google Maps');
    expect(result.modelContext).toContain('Yelp');
  });

  it('returns coming soon message with listing_id', async () => {
    const context = createMockContext();
    const result = await getReviews(
      { listing_id: '11111111-1111-1111-1111-111111111111' },
      context,
    );

    expect(result.clientBlock.type).toBe('text');
    expect(result.modelContext).toContain('11111111-1111-1111-1111-111111111111');
    expect(result.modelContext).toContain('coming soon');
  });

  it('returns coming soon message with address', async () => {
    const context = createMockContext();
    const result = await getReviews(
      { address: '123 Langdon St' },
      context,
    );

    expect(result.clientBlock.type).toBe('text');
    expect(result.modelContext).toContain('123 Langdon St');
  });

  it('rejects invalid listing_id', async () => {
    const context = createMockContext();
    await expect(
      getReviews({ listing_id: 'not-a-uuid' }, context),
    ).rejects.toThrow();
  });
});
