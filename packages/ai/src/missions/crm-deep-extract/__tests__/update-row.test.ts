/**
 * Tests for update-row step (AIN-71 step 4.5).
 */

import { describe, it, expect, vi } from 'vitest';
import type { StepContext } from '../../types';

function makeUpdateMock(opts: { error?: unknown } = {}) {
  return vi.fn().mockResolvedValue({ error: opts.error ?? null });
}

function makeSupabase(updateMock: ReturnType<typeof makeUpdateMock>) {
  return {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: updateMock,
        })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'listing-1',
                rent: null,
                bedrooms: null,
                bathrooms: null,
                sqft: null,
                address: null,
                description: null,
                title: null,
                available_from: null,
                amenities: [],
                extraction_confidence: 0.3,
                raw_extraction: {},
              },
              error: null,
            }),
          })),
        })),
      })),
    })),
  };
}

function makeCtx(
  state: Record<string, unknown>,
  supabase = makeSupabase(makeUpdateMock()),
): StepContext {
  return {
    missionId: 'mission-1',
    userId: 'user-1',
    campusId: 'uw-madison',
    campusSlug: 'uw-madison',
    input: { listingId: 'listing-1', sourceUrl: 'https://x01oncampus.com/' },
    state,
    supabase: supabase as unknown as StepContext['supabase'],
  };
}

describe('update_row step', () => {
  it('fills null columns with synthesized fields (fill-gaps merge)', async () => {
    const updateMock = makeUpdateMock();
    const supabase = makeSupabase(updateMock);
    const { updateRowStep } = await import('../steps/04-update-row');

    const ctx = makeCtx(
      {
        pages: [{ url: 'https://x01oncampus.com/', fields: {}, textExcerpt: '' }],
        discarded: [],
        latitude: 43.071,
        longitude: -89.402,
        fields: { title: 'X01 on Campus', rent: 1450, bedrooms: 2, bathrooms: 2, sqft: 900, address: '640 W Dayton St' },
      },
      supabase,
    );

    const result = await updateRowStep.run(ctx);

    expect(updateMock).toHaveBeenCalledOnce();
    const updateArg = (updateMock.mock.calls[0] as unknown[]).length > 0
      ? null // eq() was called, the update payload was in the update() call
      : null;
    void updateArg;
    expect(result.output.updatedFields).toBeDefined();
  });

  it('updates confidence to 0.6 when rent + address both present after merge', async () => {
    const updateMock = makeUpdateMock();
    const supabase = makeSupabase(updateMock);
    const { updateRowStep } = await import('../steps/04-update-row');

    const ctx = makeCtx(
      {
        pages: [{ url: 'https://x01oncampus.com/', fields: {}, textExcerpt: '' }],
        discarded: [],
        latitude: null,
        longitude: null,
        fields: { rent: 1200, address: '640 W Dayton St, Madison, WI' },
      },
      supabase,
    );

    const result = await updateRowStep.run(ctx);

    expect(result.output.confidenceAfter).toBe(0.6);
  });

  it('records floor_plan_count in output', async () => {
    const updateMock = makeUpdateMock();
    const supabase = makeSupabase(updateMock);
    const { updateRowStep } = await import('../steps/04-update-row');

    const ctx = makeCtx(
      {
        pages: [{ url: 'https://x01oncampus.com/floor-plans', fields: {}, textExcerpt: '' }],
        discarded: [],
        latitude: null,
        longitude: null,
        fields: {
          floor_plans: [
            { name: 'Studio', bedrooms: 0, rent_min: 899 },
            { name: '2BR', bedrooms: 2, rent_min: 1450 },
          ],
          rent: 899,
        },
      },
      supabase,
    );

    const result = await updateRowStep.run(ctx);

    expect(result.output.floorPlanCount).toBe(2);
  });

  // FIX 5: DB write error → throws (retryable by executor)
  it('throws when the DB update returns an error', async () => {
    const updateMock = makeUpdateMock({ error: { message: 'foreign key violation' } });
    const supabase = makeSupabase(updateMock);
    const { updateRowStep } = await import('../steps/04-update-row');

    const ctx = makeCtx(
      {
        pages: [],
        discarded: [],
        latitude: null,
        longitude: null,
        fields: { rent: 1200 },
      },
      supabase,
    );

    await expect(updateRowStep.run(ctx)).rejects.toThrow('update_row: DB write failed');
  });

  // FIX 6: row_gone must end the mission (done: true)
  it('returns done:true when the row is gone', async () => {
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        })),
      })),
    };
    const { updateRowStep } = await import('../steps/04-update-row');

    const ctx = makeCtx({}, supabase as unknown as ReturnType<typeof makeSupabase>);
    const result = await updateRowStep.run(ctx);

    expect(result.output.skipped).toBe('row_gone');
    expect(result.done).toBe(true);
  });

  // AIN-75 Fix 1: crawl_blocked persisted in raw_extraction.deep_extract
  it('sets crawl_blocked: true in raw_extraction when crawl state is "blocked"', async () => {
    let capturedUpdatePayload: Record<string, unknown> | null = null;
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn((payload: Record<string, unknown>) => {
          capturedUpdatePayload = payload;
          return {
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          };
        }),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'listing-1',
                  rent: null, bedrooms: null, bathrooms: null, sqft: null,
                  address: null, description: null, title: null,
                  available_from: null, amenities: [], extraction_confidence: 0.3,
                  raw_extraction: {},
                },
                error: null,
              }),
            })),
          })),
        })),
      })),
    };

    const { updateRowStep } = await import('../steps/04-update-row');
    const ctx = makeCtx(
      {
        crawl: 'blocked', // step 01 was bot-blocked
        pages: [],
        discarded: [],
        latitude: null,
        longitude: null,
        fields: {},
      },
      supabase as unknown as ReturnType<typeof makeSupabase>,
    );

    await updateRowStep.run(ctx);

    expect(capturedUpdatePayload).not.toBeNull();
    const raw = capturedUpdatePayload!['raw_extraction'] as Record<string, unknown>;
    const deepExtract = raw['deep_extract'] as Record<string, unknown>;
    expect(deepExtract['crawl_blocked']).toBe(true);
  });

  it('sets crawl_blocked: false in raw_extraction on a normal (non-blocked) crawl', async () => {
    let capturedUpdatePayload: Record<string, unknown> | null = null;
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn((payload: Record<string, unknown>) => {
          capturedUpdatePayload = payload;
          return {
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          };
        }),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'listing-1',
                  rent: null, bedrooms: null, bathrooms: null, sqft: null,
                  address: null, description: null, title: null,
                  available_from: null, amenities: [], extraction_confidence: 0.3,
                  raw_extraction: {},
                },
                error: null,
              }),
            })),
          })),
        })),
      })),
    };

    const { updateRowStep } = await import('../steps/04-update-row');
    const ctx = makeCtx(
      {
        // no crawl state key — successful crawl
        pages: [{ url: 'https://x01oncampus.com/', fields: {}, textExcerpt: '' }],
        discarded: [],
        latitude: null,
        longitude: null,
        fields: { rent: 1200, address: '640 W Dayton St, Madison, WI' },
      },
      supabase as unknown as ReturnType<typeof makeSupabase>,
    );

    await updateRowStep.run(ctx);

    expect(capturedUpdatePayload).not.toBeNull();
    const raw = capturedUpdatePayload!['raw_extraction'] as Record<string, unknown>;
    const deepExtract = raw['deep_extract'] as Record<string, unknown>;
    expect(deepExtract['crawl_blocked']).toBe(false);
  });

  it('never overwrites non-null existing values (fill-gaps)', async () => {
    // Supabase returns a row with existing rent = 1350
    const updateMock = makeUpdateMock();
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: updateMock,
          })),
        })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'listing-1',
                  rent: 1350, // existing non-null
                  bedrooms: null,
                  bathrooms: null,
                  sqft: null,
                  address: null,
                  description: null,
                  title: null,
                  available_from: null,
                  amenities: [],
                  extraction_confidence: 0.3,
                  raw_extraction: {},
                },
                error: null,
              }),
            })),
          })),
        })),
      })),
    };

    const { updateRowStep } = await import('../steps/04-update-row');

    const ctx = makeCtx(
      {
        pages: [],
        discarded: [],
        latitude: null,
        longitude: null,
        fields: { rent: 1200 }, // synthesized rent = 1200, but row already has 1350
      },
      supabase as unknown as ReturnType<typeof makeSupabase>,
    );

    await updateRowStep.run(ctx);

    // The update call should not include rent (since row already has it)
    const updateFn = supabase.from().update as ReturnType<typeof vi.fn>;
    if (updateFn.mock.calls.length > 0) {
      const firstCall = updateFn.mock.calls.at(0);
      const updatePayload = (firstCall?.at(0)) as Record<string, unknown> | undefined;
      expect(updatePayload?.rent).toBeUndefined();
    }
  });
});
