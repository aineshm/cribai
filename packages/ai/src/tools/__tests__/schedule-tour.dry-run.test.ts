/**
 * AIN-9 review FIX 2 (handler-level) — `schedule_tour` with `confirmed=true`
 * + `dryRun=true` in the ToolContext must NOT insert into `tour_requests`,
 * but must return a synthetic success result (same shape — `tour_confirmation`
 * + success modelContext) so the eval scoring still sees the tool ran end to
 * end. The eval HITL scorer detects leaks post-hoc; this guard PREVENTS the
 * real insert at the handler boundary.
 */

import { describe, it, expect, vi } from 'vitest';
import { scheduleTour } from '../handlers/schedule-tour';
import {
  createMockContext,
  createMockQueryBuilder,
  SAMPLE_LISTING_ROW,
} from './helpers';

const baseArgs = {
  listing_id: '11111111-1111-1111-1111-111111111111',
  student_name: 'Jane Doe',
  student_email: 'jane@wisc.edu',
  preferred_dates: ['2026-06-15'],
  notes: 'Morning preferred',
  confirmed: true,
};

describe('scheduleTour — FIX 2 dryRun gate (no real insert in eval)', () => {
  it('with dryRun=true + confirmed=true, does NOT call .insert and returns a synthetic success', async () => {
    // Mocks for the two READS that still happen (listing existence +
    // existing-tour conflict scan — both are harmless reads under
    // service-role and useful in eval to mirror real behavior).
    const listingBuilder = createMockQueryBuilder({
      id: SAMPLE_LISTING_ROW.id,
      address: SAMPLE_LISTING_ROW.address,
    });
    const existingToursBuilder = createMockQueryBuilder([]);
    // Insert builder is wired up just so we can SPY on it: if the handler
    // tried to use it (it must not), the test would observe the call.
    const insertBuilder = createMockQueryBuilder({ id: 'should-never-be-used' });
    const context = createMockContext({ dryRun: true } as never);
    vi.mocked(context.supabase.from)
      .mockReturnValueOnce(listingBuilder as never)
      .mockReturnValueOnce(existingToursBuilder as never)
      .mockReturnValueOnce(insertBuilder as never);

    const result = await scheduleTour(baseArgs, context);

    // Load-bearing assertion: .insert was NEVER invoked anywhere on the
    // supabase builder chain. This is what stops a real row from landing in
    // `tour_requests` during an eval run.
    expect(insertBuilder.insert).not.toHaveBeenCalled();
    expect(listingBuilder.insert).not.toHaveBeenCalled();

    // Shape parity with the real publish path so scoring still sees a tour
    // confirmation block + the model context that signals "tour booked".
    expect(result.clientBlock.type).toBe('tour_confirmation');
    if (result.clientBlock.type === 'tour_confirmation') {
      expect(result.clientBlock.status).toBe('pending');
      expect(result.clientBlock.listingAddress).toBe('123 Langdon St');
    }
    expect(result.modelContext).toMatch(/Tour request submitted|dry[- ]?run/i);
  });

  it('with dryRun=false + confirmed=true, performs the real insert as before (byte-identical behavior)', async () => {
    const listingBuilder = createMockQueryBuilder({
      id: SAMPLE_LISTING_ROW.id,
      address: SAMPLE_LISTING_ROW.address,
    });
    const existingToursBuilder = createMockQueryBuilder([]);
    const insertBuilder = createMockQueryBuilder({ id: 'new-tour-id' });

    const context = createMockContext(); // dryRun defaults to undefined / false
    vi.mocked(context.supabase.from)
      .mockReturnValueOnce(listingBuilder as never)
      .mockReturnValueOnce(existingToursBuilder as never)
      .mockReturnValueOnce(insertBuilder as never);

    const result = await scheduleTour(baseArgs, context);

    // Real path DOES call .insert (the existing behavior must remain intact).
    expect(insertBuilder.insert).toHaveBeenCalledTimes(1);
    expect(result.clientBlock.type).toBe('tour_confirmation');
  });
});
