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

  // --- Auth + validation (apply to both phases) ---

  describe('auth and validation', () => {
    it('throws when user is not authenticated', async () => {
      const context = createMockContext({ userId: undefined });
      // Listing lookup still happens first; the auth check runs before any DB
      // call by virtue of Zod parsing + the userId guard.
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

      await expect(scheduleTour(validArgs, context)).rejects.toThrow(
        'Listing not found',
      );
    });
  });

  // --- Phase 1: Preview (confirmed=false / omitted) ---

  describe('Phase 1: preview', () => {
    it('returns text preview without writing to tour_requests when confirmed is omitted', async () => {
      const listingBuilder = createMockQueryBuilder({
        id: SAMPLE_LISTING_ROW.id,
        address: SAMPLE_LISTING_ROW.address,
      });
      const existingToursBuilder = createMockQueryBuilder([]);

      const context = createMockContext();
      vi.mocked(context.supabase.from)
        .mockReturnValueOnce(listingBuilder as never)
        .mockReturnValueOnce(existingToursBuilder as never);

      const result = await scheduleTour(validArgs, context);

      // Preview shape: text block, not a tour_confirmation
      expect(result.clientBlock.type).toBe('text');
      if (result.clientBlock.type === 'text') {
        expect(result.clientBlock.content).toContain('TOUR REQUEST PREVIEW');
        expect(result.clientBlock.content).toContain('123 Langdon St');
        expect(result.clientBlock.content).toContain('Jane Doe');
        expect(result.clientBlock.content).toContain('jane@wisc.edu');
        expect(result.clientBlock.content).toContain('2026-04-01');
      }
      // modelContext must instruct the LLM to confirm before publish
      expect(result.modelContext).toContain('confirmed=true');
      expect(result.modelContext).toContain('not submitted');

      // Verify NO insert was attempted — supabase.from was called exactly
      // twice (listing lookup + existing tours lookup), no third call
      expect(vi.mocked(context.supabase.from)).toHaveBeenCalledTimes(2);
    });

    it('returns preview when confirmed=false explicitly', async () => {
      const listingBuilder = createMockQueryBuilder({
        id: SAMPLE_LISTING_ROW.id,
        address: SAMPLE_LISTING_ROW.address,
      });
      const existingToursBuilder = createMockQueryBuilder([]);

      const context = createMockContext();
      vi.mocked(context.supabase.from)
        .mockReturnValueOnce(listingBuilder as never)
        .mockReturnValueOnce(existingToursBuilder as never);

      const result = await scheduleTour({ ...validArgs, confirmed: false }, context);

      expect(result.clientBlock.type).toBe('text');
      if (result.clientBlock.type === 'text') {
        expect(result.clientBlock.content).toContain('TOUR REQUEST PREVIEW');
      }
    });

    it('surfaces date conflicts inside the preview', async () => {
      const listingBuilder = createMockQueryBuilder({
        id: SAMPLE_LISTING_ROW.id,
        address: SAMPLE_LISTING_ROW.address,
      });
      const existingToursBuilder = createMockQueryBuilder([
        {
          preferred_dates: ['2026-04-01', '2026-04-05'],
          listing_id: '22222222-2222-2222-2222-222222222222',
          id: 'existing-tour-1',
        },
      ]);
      const conflictListingsBuilder = createMockQueryBuilder([
        { id: '22222222-2222-2222-2222-222222222222', address: '456 State St' },
      ]);

      const context = createMockContext();
      vi.mocked(context.supabase.from)
        .mockReturnValueOnce(listingBuilder as never)
        .mockReturnValueOnce(existingToursBuilder as never)
        .mockReturnValueOnce(conflictListingsBuilder as never);

      const result = await scheduleTour(validArgs, context);

      expect(result.clientBlock.type).toBe('text');
      if (result.clientBlock.type === 'text') {
        expect(result.clientBlock.content).toContain('Heads up');
        expect(result.clientBlock.content).toContain('2026-04-01');
        expect(result.clientBlock.content).toContain('456 State St');
      }
    });
  });

  // --- Phase 2: Publish (confirmed=true) ---

  describe('Phase 2: publish', () => {
    const publishArgs = { ...validArgs, confirmed: true };

    it('creates tour request successfully with no conflicts', async () => {
      const listingBuilder = createMockQueryBuilder({
        id: SAMPLE_LISTING_ROW.id,
        address: SAMPLE_LISTING_ROW.address,
      });
      const existingToursBuilder = createMockQueryBuilder([]);
      const insertBuilder = createMockQueryBuilder({ id: 'new-tour-id' });

      const context = createMockContext();
      vi.mocked(context.supabase.from)
        .mockReturnValueOnce(listingBuilder as never)
        .mockReturnValueOnce(existingToursBuilder as never)
        .mockReturnValueOnce(insertBuilder as never);

      const result = await scheduleTour(publishArgs, context);

      expect(result.clientBlock.type).toBe('tour_confirmation');
      if (result.clientBlock.type === 'tour_confirmation') {
        expect(result.clientBlock.status).toBe('pending');
        expect(result.clientBlock.listingAddress).toBe('123 Langdon St');
      }
      expect(result.modelContext).toContain('Tour request submitted');
      expect(result.modelContext).not.toContain('existing pending tours');
    });

    it('warns about date conflicts with existing tours', async () => {
      const listingBuilder = createMockQueryBuilder({
        id: SAMPLE_LISTING_ROW.id,
        address: SAMPLE_LISTING_ROW.address,
      });
      const existingToursBuilder = createMockQueryBuilder([
        {
          preferred_dates: ['2026-04-01', '2026-04-05'],
          listing_id: '22222222-2222-2222-2222-222222222222',
          id: 'existing-tour-1',
        },
      ]);
      const insertBuilder = createMockQueryBuilder({ id: 'new-tour-id' });
      const conflictListingsBuilder = createMockQueryBuilder([
        { id: '22222222-2222-2222-2222-222222222222', address: '456 State St' },
      ]);

      const context = createMockContext();
      vi.mocked(context.supabase.from)
        .mockReturnValueOnce(listingBuilder as never)
        .mockReturnValueOnce(existingToursBuilder as never)
        .mockReturnValueOnce(insertBuilder as never)
        .mockReturnValueOnce(conflictListingsBuilder as never);

      const result = await scheduleTour(publishArgs, context);

      expect(result.clientBlock.type).toBe('tour_confirmation');
      expect(result.modelContext).toContain('existing pending tours');
      expect(result.modelContext).toContain('2026-04-01');
      expect(result.modelContext).toContain('456 State St');
    });

    it('creates tour despite conflicts (not blocked)', async () => {
      const listingBuilder = createMockQueryBuilder({
        id: SAMPLE_LISTING_ROW.id,
        address: SAMPLE_LISTING_ROW.address,
      });
      const existingToursBuilder = createMockQueryBuilder([
        {
          preferred_dates: ['2026-04-03'],
          listing_id: '33333333-3333-3333-3333-333333333333',
          id: 'existing-tour-2',
        },
      ]);
      const insertBuilder = createMockQueryBuilder({ id: 'new-tour-id' });
      const conflictListingsBuilder = createMockQueryBuilder([
        { id: '33333333-3333-3333-3333-333333333333', address: '789 University Ave' },
      ]);

      const context = createMockContext();
      vi.mocked(context.supabase.from)
        .mockReturnValueOnce(listingBuilder as never)
        .mockReturnValueOnce(existingToursBuilder as never)
        .mockReturnValueOnce(insertBuilder as never)
        .mockReturnValueOnce(conflictListingsBuilder as never);

      const result = await scheduleTour(publishArgs, context);

      expect(result.clientBlock.type).toBe('tour_confirmation');
      if (result.clientBlock.type === 'tour_confirmation') {
        expect(result.clientBlock.tourRequestId).toBe('new-tour-id');
      }
    });

    it('handles duplicate tour request error', async () => {
      const listingBuilder = createMockQueryBuilder({
        id: SAMPLE_LISTING_ROW.id,
        address: SAMPLE_LISTING_ROW.address,
      });
      const existingToursBuilder = createMockQueryBuilder([]);
      const insertBuilder = createMockQueryBuilder(null, {
        code: '23505',
        message: 'unique violation',
      });

      const context = createMockContext();
      vi.mocked(context.supabase.from)
        .mockReturnValueOnce(listingBuilder as never)
        .mockReturnValueOnce(existingToursBuilder as never)
        .mockReturnValueOnce(insertBuilder as never);

      await expect(scheduleTour(publishArgs, context)).rejects.toThrow(
        'already have a pending tour',
      );
    });
  });
});
