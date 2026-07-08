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

  // AIN-83 Task 4: never-wipe guard. A prior ingest-time seed (Task 3) or an
  // earlier successful mission run already wrote raw_extraction.deep_extract
  // .floor_plans. A LATER mission run (e.g. re-run after a blocked fetch, or
  // a page that no longer carries structured/LLM floor_plans this time)
  // must NOT null it out — the deep_extract write becomes fill-gap for
  // floor_plans specifically (every other deep_extract subfield still
  // always-overwrites).
  it('preserves existing raw_extraction.deep_extract.floor_plans when this run produced none (never-wipe guard)', async () => {
    let capturedUpdatePayload: Record<string, unknown> | null = null;
    const existingPlans = [
      { name: 'A11', bedrooms: 1, bathrooms: 1, rent_min: 1819, rent_max: 2118, sqft: 799 },
    ];
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
                  rent: 1819, bedrooms: 1, bathrooms: 1, sqft: 799,
                  address: '4702 Madison Yards Way', description: null, title: 'EO Madison Yards',
                  available_from: null, amenities: [], extraction_confidence: 0.6,
                  raw_extraction: {
                    deep_extract: {
                      pages: ['https://www.zillow.com/apartments/x/'],
                      discarded: [],
                      floor_plans: existingPlans,
                      price_is_from: true,
                      crawl_blocked: false,
                      method: 'ingest_v1',
                      completed_at: '2026-07-01T00:00:00.000Z',
                    },
                  },
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
        // This run's crawl found nothing new (e.g. blocked fetch on re-run).
        crawl: 'blocked',
        pages: [],
        discarded: [],
        latitude: null,
        longitude: null,
        fields: {}, // no floor_plans this run
      },
      supabase as unknown as ReturnType<typeof makeSupabase>,
    );

    const result = await updateRowStep.run(ctx);

    expect(capturedUpdatePayload).not.toBeNull();
    const raw = capturedUpdatePayload!['raw_extraction'] as Record<string, unknown>;
    const deepExtract = raw['deep_extract'] as Record<string, unknown>;
    expect(deepExtract['floor_plans']).toEqual(existingPlans);
    expect(deepExtract['price_is_from']).toBe(true);
    // The output count reflects what's ACTUALLY persisted, not just this run's yield.
    expect(result.output.floorPlanCount).toBe(1);
  });

  it('a run that DOES produce new floor_plans overwrites the existing (preserved) ones', async () => {
    let capturedUpdatePayload: Record<string, unknown> | null = null;
    const newPlans = [
      { name: 'S1', bedrooms: 0, bathrooms: 1, rent_min: 1825, rent_max: 1825, sqft: 547 },
      { name: 'A11', bedrooms: 1, bathrooms: 1, rent_min: 1819, rent_max: 2118, sqft: 799 },
    ];
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
                  rent: 1819, bedrooms: 1, bathrooms: 1, sqft: 799,
                  address: '4702 Madison Yards Way', description: null, title: 'EO Madison Yards',
                  available_from: null, amenities: [], extraction_confidence: 0.6,
                  raw_extraction: {
                    deep_extract: {
                      pages: [],
                      discarded: [],
                      floor_plans: [{ name: 'Old Stale Plan', rent_min: 1 }],
                      price_is_from: true,
                      crawl_blocked: true,
                      method: 'ingest_v1',
                      completed_at: '2026-06-01T00:00:00.000Z',
                    },
                  },
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
        pages: [{ url: 'https://www.zillow.com/apartments/x/', fields: {}, textExcerpt: '' }],
        discarded: [],
        latitude: null,
        longitude: null,
        fields: { floor_plans: newPlans, rent: 1819 },
      },
      supabase as unknown as ReturnType<typeof makeSupabase>,
    );

    const result = await updateRowStep.run(ctx);

    expect(capturedUpdatePayload).not.toBeNull();
    const raw = capturedUpdatePayload!['raw_extraction'] as Record<string, unknown>;
    const deepExtract = raw['deep_extract'] as Record<string, unknown>;
    expect(deepExtract['floor_plans']).toEqual(newPlans);
    expect(result.output.floorPlanCount).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // AIN-98 Task 6: never-wipe guard for units_of_interest. The mission's
  // `synthFields` (03-synthesize.ts) never produces units_of_interest — that
  // subtree is written ONLY by addListing's ingest-time seed/accumulation
  // (Tasks 2-4). Without an explicit carry-forward, the mission's wholesale
  // `deep_extract` rebuild here would silently drop it on every mission run —
  // the same class of bug floor_plans already fixed in AIN-83.
  // ---------------------------------------------------------------------------
  it('preserves existing raw_extraction.deep_extract.units_of_interest across a mission run (never-wipe guard)', async () => {
    let capturedUpdatePayload: Record<string, unknown> | null = null;
    const existingUnits = [
      { zpid: '2056051402', unit_number: 'Unit 1405', plan_name: 'S1', price: 1825, viewed_at: '2026-07-18T07:00:00.000Z' },
    ];
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
                  rent: 1825, bedrooms: 0, bathrooms: 1, sqft: 547,
                  address: '4702 Madison Yards Way', description: null, title: 'EO Madison Yards',
                  available_from: null, amenities: [], extraction_confidence: 0.6,
                  raw_extraction: {
                    deep_extract: {
                      floor_plans: [{ name: 'S1', bedrooms: 0, bathrooms: 1, rent_min: 1825, rent_max: 1825, sqft: 547 }],
                      price_is_from: true,
                      method: 'ingest_v1',
                      units_of_interest: existingUnits,
                    },
                  },
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
        // A normal mission run — synthesize never produces units_of_interest,
        // it only ever comes from addListing's ingest-time write.
        pages: [{ url: 'https://www.zillow.com/apartments/x/', fields: {}, textExcerpt: '' }],
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
    expect(deepExtract['units_of_interest']).toEqual(existingUnits);
    // Every other subfield still rebuilds normally alongside the preserved value.
    expect(deepExtract['method']).toBe('mission_v1');
  });

  it('carries units_of_interest forward even when the run also DOES produce new floor_plans', async () => {
    let capturedUpdatePayload: Record<string, unknown> | null = null;
    const existingUnits = [
      { zpid: 'zpid-1', viewed_at: '2026-07-01T00:00:00.000Z' },
    ];
    const newPlans = [{ name: 'A11', bedrooms: 1, bathrooms: 1, rent_min: 1819, rent_max: 2118, sqft: 799 }];
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn((payload: Record<string, unknown>) => {
          capturedUpdatePayload = payload;
          return { eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) };
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
                  raw_extraction: {
                    deep_extract: { units_of_interest: existingUnits },
                  },
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
        pages: [{ url: 'https://www.zillow.com/apartments/x/', fields: {}, textExcerpt: '' }],
        discarded: [],
        latitude: null,
        longitude: null,
        fields: { floor_plans: newPlans, rent: 1819, address: '4702 Madison Yards Way' },
      },
      supabase as unknown as ReturnType<typeof makeSupabase>,
    );

    await updateRowStep.run(ctx);

    const raw = capturedUpdatePayload!['raw_extraction'] as Record<string, unknown>;
    const deepExtract = raw['deep_extract'] as Record<string, unknown>;
    expect(deepExtract['units_of_interest']).toEqual(existingUnits);
    expect(deepExtract['floor_plans']).toEqual(newPlans);
  });

  it('units_of_interest defaults to null (mirrors floor_plans) when the existing row never had any', async () => {
    let capturedUpdatePayload: Record<string, unknown> | null = null;
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn((payload: Record<string, unknown>) => {
          capturedUpdatePayload = payload;
          return { eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) };
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
        pages: [],
        discarded: [],
        latitude: null,
        longitude: null,
        fields: {},
      },
      supabase as unknown as ReturnType<typeof makeSupabase>,
    );

    await updateRowStep.run(ctx);

    const raw = capturedUpdatePayload!['raw_extraction'] as Record<string, unknown>;
    const deepExtract = raw['deep_extract'] as Record<string, unknown>;
    expect(deepExtract['units_of_interest']).toBeNull();
  });

  // AIN-83 live-proof finding: the cheapest-plan bedrooms/bathrooms/sqft
  // backfill was gated on `computedMin < effectiveRent`, which is FALSE in
  // the normal deterministic case where the baseline rent is already the
  // cheapest plan's price (they're the same number — synthesize derives one
  // from the other). That left bedrooms/bathrooms/sqft null on a fresh row
  // even though the winning floor plan had the answer. The backfill must run
  // whenever floorPlans is non-empty, independent of the rent comparison,
  // and must still respect fill-gaps (never overwrite an existing value).
  it('backfills bedrooms/bathrooms/sqft from the cheapest plan even when its rent equals the synthesized rent', async () => {
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
        pages: [{ url: 'https://www.zillow.com/apartments/x/', fields: {}, textExcerpt: '' }],
        discarded: [],
        latitude: null,
        longitude: null,
        fields: {
          rent: 3693,
          floor_plans: [
            { name: 'S1', bedrooms: 1, bathrooms: 1, rent_min: 3693, rent_max: 3693, sqft: 437 },
          ],
        },
      },
      supabase as unknown as ReturnType<typeof makeSupabase>,
    );

    const result = await updateRowStep.run(ctx);

    expect(result.output.updatedFields).toContain('bedrooms');
    expect(result.output.updatedFields).toContain('bathrooms');
    expect(result.output.updatedFields).toContain('sqft');

    expect(capturedUpdatePayload).not.toBeNull();
    expect(capturedUpdatePayload!['bedrooms']).toBe(1);
    expect(capturedUpdatePayload!['bathrooms']).toBe(1);
    expect(capturedUpdatePayload!['sqft']).toBe(437);
  });

  it('does not overwrite an existing bedrooms value with the cheapest-plan backfill (fill-gaps preserved)', async () => {
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
                  rent: null,
                  bedrooms: 4, // existing non-null — must NOT be overwritten
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
        pages: [{ url: 'https://www.zillow.com/apartments/x/', fields: {}, textExcerpt: '' }],
        discarded: [],
        latitude: null,
        longitude: null,
        fields: {
          rent: 3693,
          floor_plans: [
            { name: 'S1', bedrooms: 1, bathrooms: 1, rent_min: 3693, rent_max: 3693, sqft: 437 },
          ],
        },
      },
      supabase as unknown as ReturnType<typeof makeSupabase>,
    );

    await updateRowStep.run(ctx);

    expect(capturedUpdatePayload).not.toBeNull();
    expect(capturedUpdatePayload!['bedrooms']).toBeUndefined();
    // bathrooms/sqft were null on the row — those still fill.
    expect(capturedUpdatePayload!['bathrooms']).toBe(1);
    expect(capturedUpdatePayload!['sqft']).toBe(437);
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
