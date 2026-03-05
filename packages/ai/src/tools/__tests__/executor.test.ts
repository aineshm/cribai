import { describe, it, expect, vi } from 'vitest';
import { executeTool } from '../executor';
import { createMockContext, createMockQueryBuilder, SAMPLE_LISTING_ROW } from './helpers';

describe('executeTool', () => {
  it('dispatches search_listings correctly', async () => {
    const builder = createMockQueryBuilder([SAMPLE_LISTING_ROW]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    const result = await executeTool('search_listings', {}, context);
    expect(result.clientBlock.type).toBe('listing_card');
  });

  it('dispatches explain_lease_term correctly', async () => {
    const context = createMockContext();
    const result = await executeTool('explain_lease_term', { term: 'subletting' }, context);
    expect(result.clientBlock.type).toBe('legal_disclaimer');
  });

  it('throws for unknown tool', async () => {
    const context = createMockContext();
    await expect(executeTool('nonexistent_tool', {}, context)).rejects.toThrow('Unknown tool');
  });
});
