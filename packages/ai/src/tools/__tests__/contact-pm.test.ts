import { describe, it, expect } from 'vitest';
import { contactPm } from '../handlers/contact-pm';
import { createMockContext } from './helpers';

describe('contactPm', () => {
  it('returns coming soon message with listing_id', async () => {
    const context = createMockContext();
    const result = await contactPm(
      { listing_id: '11111111-1111-1111-1111-111111111111' },
      context,
    );

    expect(result.clientBlock.type).toBe('text');
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('coming soon');
    }
    expect(result.modelContext).toContain('coming soon');
    expect(result.modelContext).toContain('listing detail');
  });

  it('accepts optional message', async () => {
    const context = createMockContext();
    const result = await contactPm(
      {
        listing_id: '11111111-1111-1111-1111-111111111111',
        message: 'Is this still available?',
      },
      context,
    );

    expect(result.clientBlock.type).toBe('text');
    expect(result.modelContext).toContain('coming soon');
  });

  it('rejects missing listing_id', async () => {
    const context = createMockContext();
    await expect(contactPm({}, context)).rejects.toThrow();
  });

  it('rejects invalid listing_id', async () => {
    const context = createMockContext();
    await expect(
      contactPm({ listing_id: 'bad-id' }, context),
    ).rejects.toThrow();
  });

  it('rejects message over 500 chars', async () => {
    const context = createMockContext();
    await expect(
      contactPm(
        {
          listing_id: '11111111-1111-1111-1111-111111111111',
          message: 'a'.repeat(501),
        },
        context,
      ),
    ).rejects.toThrow();
  });
});
