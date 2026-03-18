import { describe, it, expect, vi } from 'vitest';
import { executeTool } from '../executor';
import { createMockContext, createMockQueryBuilder, SAMPLE_LISTING_ROW } from './helpers';

vi.mock('../lib/agent-run-logger', () => ({
  logAgentRun: vi.fn(),
  sanitizeArgs: vi.fn((_name: string, args: Record<string, unknown>) => args),
  extractResultSummary: vi.fn(() => ({})),
}));

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

  it('blocks tools that are not allowed for the current viewer', async () => {
    const context = createMockContext({
      userId: undefined,
      allowedToolNames: ['search_listings', 'get_listing_detail'],
    });

    await expect(
      executeTool(
        'contact_pm',
        { listing_id: SAMPLE_LISTING_ROW.id },
        context,
      ),
    ).rejects.toThrow('This action requires signing in.');
  });

  it('throws for unknown tool', async () => {
    const context = createMockContext();
    await expect(executeTool('nonexistent_tool', {}, context)).rejects.toThrow('Unknown tool');
  });

  it('logs successful tool execution', async () => {
    const { logAgentRun } = await import('../lib/agent-run-logger');
    const builder = createMockQueryBuilder([SAMPLE_LISTING_ROW]);
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    await executeTool('search_listings', {}, context);

    expect(logAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ resultStatus: 'success', toolName: 'search_listings' }),
    );
  });

  it('logs failed tool execution', async () => {
    const { logAgentRun } = await import('../lib/agent-run-logger');
    const context = createMockContext();

    await expect(executeTool('nonexistent_tool', {}, context)).rejects.toThrow('Unknown tool');

    // logAgentRun is not called for unknown tool (throws before handler)
    // Use a handler that actually throws to test error logging
    const builder = createMockQueryBuilder([]);
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    // Simulate handler error by mocking supabase to throw
    vi.mocked(context.supabase.from).mockImplementationOnce(() => {
      throw new Error('DB connection failed');
    });

    await expect(executeTool('search_listings', {}, context)).rejects.toThrow('DB connection failed');

    expect(logAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ resultStatus: 'error', toolName: 'search_listings' }),
    );
  });
});
