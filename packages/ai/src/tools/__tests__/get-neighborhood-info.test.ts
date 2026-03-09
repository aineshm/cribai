import { describe, it, expect } from 'vitest';
import { getNeighborhoodInfo } from '../handlers/get-neighborhood-info';
import { createMockContext } from './helpers';

describe('getNeighborhoodInfo', () => {
  it('returns placeholder info with no args', async () => {
    const context = createMockContext();
    const result = await getNeighborhoodInfo({}, context);

    expect(result.clientBlock.type).toBe('text');
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('Walk Score');
      expect(result.clientBlock.content).toContain('Google Maps');
    }
    expect(result.modelContext).toContain('walkability');
    expect(result.modelContext).toContain('safety');
    expect(result.modelContext).toContain('commute');
    expect(result.modelContext).toContain('vibe');
  });

  it('includes address when provided', async () => {
    const context = createMockContext();
    const result = await getNeighborhoodInfo(
      { address: '123 Langdon St' },
      context,
    );

    expect(result.modelContext).toContain('123 Langdon St');
  });

  it('includes listing_id when provided', async () => {
    const context = createMockContext();
    const result = await getNeighborhoodInfo(
      { listing_id: '11111111-1111-1111-1111-111111111111' },
      context,
    );

    expect(result.modelContext).toContain('11111111-1111-1111-1111-111111111111');
  });

  it('handles topics parameter', async () => {
    const context = createMockContext();
    const result = await getNeighborhoodInfo(
      { topics: ['walkability', 'safety'] },
      context,
    );

    expect(result.clientBlock.type).toBe('text');
    expect(result.modelContext).toContain('walkability');
    expect(result.modelContext).toContain('safety');
  });

  it('rejects invalid listing_id', async () => {
    const context = createMockContext();
    await expect(
      getNeighborhoodInfo({ listing_id: 'not-uuid' }, context),
    ).rejects.toThrow();
  });
});
