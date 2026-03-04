import { describe, it, expect, vi } from 'vitest';
import { scheduleTour } from '../handlers/schedule-tour';
import { createMockContext, createMockQueryBuilder, SAMPLE_LISTING_ROW } from './helpers';

describe('scheduleTour', () => {
  const validArgs = {
    listing_id: '11111111-1111-1111-1111-111111111111',
    student_name: 'Jane Doe',
    student_email: 'jane@wisc.edu',
    preferred_dates: ['2026-04-01', '2026-04-03'],
    notes: 'Morning preferred',
  };

  it('creates tour request successfully', async () => {
    // First call: listing lookup
    const listingBuilder = createMockQueryBuilder({ id: SAMPLE_LISTING_ROW.id, address: SAMPLE_LISTING_ROW.address });
    // Second call: insert
    const insertBuilder = createMockQueryBuilder({ id: 'new-tour-id' });

    const context = createMockContext();
    vi.mocked(context.supabase.from)
      .mockReturnValueOnce(listingBuilder as never)
      .mockReturnValueOnce(insertBuilder as never);

    const result = await scheduleTour(validArgs, context);

    expect(result.clientBlock.type).toBe('tour_confirmation');
    if (result.clientBlock.type === 'tour_confirmation') {
      expect(result.clientBlock.status).toBe('pending');
      expect(result.clientBlock.listingAddress).toBe('123 Langdon St');
    }
    expect(result.modelContext).toContain('Tour request submitted');
  });

  it('throws when user is not authenticated', async () => {
    const context = createMockContext({ userId: undefined });

    await expect(scheduleTour(validArgs, context)).rejects.toThrow('signed in');
  });

  it('throws on invalid email', async () => {
    const context = createMockContext();
    await expect(
      scheduleTour({ ...validArgs, student_email: 'not-an-email' }, context),
    ).rejects.toThrow();
  });

  it('throws when listing not found', async () => {
    const builder = createMockQueryBuilder(null, { message: 'not found' });
    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(builder as never);

    await expect(scheduleTour(validArgs, context)).rejects.toThrow('Listing not found');
  });

  it('handles duplicate tour request error', async () => {
    const listingBuilder = createMockQueryBuilder({ id: SAMPLE_LISTING_ROW.id, address: SAMPLE_LISTING_ROW.address });
    const insertBuilder = createMockQueryBuilder(null, { code: '23505', message: 'unique violation' });

    const context = createMockContext();
    vi.mocked(context.supabase.from)
      .mockReturnValueOnce(listingBuilder as never)
      .mockReturnValueOnce(insertBuilder as never);

    await expect(scheduleTour(validArgs, context)).rejects.toThrow('already have a pending tour');
  });
});
