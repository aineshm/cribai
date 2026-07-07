/**
 * AIN-93 Task 2 — seed CLI core operations. The CLI's `main()`/`isDirectRun`
 * wiring is intentionally untested here (it needs a real Supabase + env) —
 * these tests cover the pure-ish DB operations with stubbed `.from()` chains,
 * same convention as `crm/__tests__/add-listing.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  wipeFixtureRows,
  insertFixtureRows,
  fetchFixtureRows,
  resolveSeedListingIds,
  diffSeedRow,
} from '../seed-cli';
import { SEED_LISTING_KEYS, SEED_LISTINGS, FIXTURE_URL_PREFIX } from '../seed-truth';

function fakeSupabase(fromImpl: (table: string) => unknown): SupabaseClient {
  return { from: vi.fn(fromImpl) } as unknown as SupabaseClient;
}

describe('wipeFixtureRows', () => {
  it('deletes ONLY rows scoped to user_id AND the fixture source_url prefix', async () => {
    const likeSpy = vi.fn().mockResolvedValue({ error: null, count: 8 });
    const eqSpy = vi.fn().mockReturnValue({ like: likeSpy });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabase = fakeSupabase((table) => {
      expect(table).toBe('crm_listings');
      return { delete: deleteSpy };
    });

    const count = await wipeFixtureRows(supabase, 'user-1');

    expect(count).toBe(8);
    expect(deleteSpy).toHaveBeenCalledWith({ count: 'exact' });
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'user-1');
    expect(likeSpy).toHaveBeenCalledWith('source_url', `${FIXTURE_URL_PREFIX}%`);
  });

  it('throws on a delete error rather than silently reporting 0', async () => {
    const supabase = fakeSupabase(() => ({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ like: vi.fn().mockResolvedValue({ error: { message: 'boom' }, count: null }) }),
      }),
    }));

    await expect(wipeFixtureRows(supabase, 'user-1')).rejects.toThrow(/boom/);
  });
});

describe('insertFixtureRows', () => {
  it('inserts the 8 truth rows and maps DB ids back to fixture keys', async () => {
    const returnedRows = SEED_LISTING_KEYS.map((key, i) => ({
      id: `db-id-${i}`,
      source_url: SEED_LISTINGS[key].sourceUrl,
    }));
    const selectSpy = vi.fn().mockResolvedValue({ data: returnedRows, error: null });
    const insertSpy = vi.fn().mockReturnValue({ select: selectSpy });
    const supabase = fakeSupabase(() => ({ insert: insertSpy }));

    const seeded = await insertFixtureRows(supabase, 'user-1');

    expect(seeded).toHaveLength(8);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ user_id: 'user-1' })]),
    );
    for (const key of SEED_LISTING_KEYS) {
      expect(seeded.find((s) => s.key === key)).toBeDefined();
    }
  });

  it('throws when the insert returns fewer than 8 recognizable rows', async () => {
    const supabase = fakeSupabase(() => ({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'only-one', source_url: SEED_LISTINGS.studio.sourceUrl }],
          error: null,
        }),
      }),
    }));

    await expect(insertFixtureRows(supabase, 'user-1')).rejects.toThrow(/missing keys/);
  });

  it('throws when the insert errors', async () => {
    const supabase = fakeSupabase(() => ({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
      }),
    }));

    await expect(insertFixtureRows(supabase, 'user-1')).rejects.toThrow(/insert failed/);
  });
});

describe('fetchFixtureRows / resolveSeedListingIds', () => {
  const allRows = SEED_LISTING_KEYS.map((key, i) => ({
    id: `db-id-${i}`,
    source_url: SEED_LISTINGS[key].sourceUrl,
    nickname: SEED_LISTINGS[key].nickname,
  }));

  it('fetchFixtureRows scopes by user_id + source_url prefix', async () => {
    const likeSpy = vi.fn().mockResolvedValue({ data: allRows, error: null });
    const eqSpy = vi.fn().mockReturnValue({ like: likeSpy });
    const supabase = fakeSupabase(() => ({ select: vi.fn().mockReturnValue({ eq: eqSpy }) }));

    const rows = await fetchFixtureRows(supabase, 'user-1');
    expect(rows).toHaveLength(8);
    expect(likeSpy).toHaveBeenCalledWith('source_url', `${FIXTURE_URL_PREFIX}%`);
  });

  it('resolveSeedListingIds returns a complete key->id map', async () => {
    const supabase = fakeSupabase(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ like: vi.fn().mockResolvedValue({ data: allRows, error: null }) }),
      }),
    }));

    const map = await resolveSeedListingIds(supabase, 'user-1');
    for (const key of SEED_LISTING_KEYS) {
      expect(map[key]).toBe(`db-id-${SEED_LISTING_KEYS.indexOf(key)}`);
    }
  });

  it('resolveSeedListingIds throws when a key is missing (re-seed needed)', async () => {
    const partial = allRows.filter((r) => r.source_url !== SEED_LISTINGS.archived.sourceUrl);
    const supabase = fakeSupabase(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ like: vi.fn().mockResolvedValue({ data: partial, error: null }) }),
      }),
    }));

    await expect(resolveSeedListingIds(supabase, 'user-1')).rejects.toThrow(/archived/);
  });
});

describe('diffSeedRow', () => {
  const truth = SEED_LISTINGS.twobed_basic;

  it('reports no mismatches for a row matching truth exactly', () => {
    const row = {
      rent: truth.rent,
      bedrooms: truth.bedrooms,
      bathrooms: truth.bathrooms,
      sqft: truth.sqft,
      address: truth.address,
      status: truth.status,
      nickname: truth.nickname,
    };
    expect(diffSeedRow(truth, row)).toEqual([]);
  });

  it('reports every mismatched field', () => {
    const row = {
      rent: 999999,
      bedrooms: truth.bedrooms,
      bathrooms: truth.bathrooms,
      sqft: truth.sqft,
      address: 'wrong address',
      status: truth.status,
      nickname: truth.nickname,
    };
    const mismatches = diffSeedRow(truth, row);
    expect(mismatches.some((m) => m.startsWith('rent:'))).toBe(true);
    expect(mismatches.some((m) => m.startsWith('address:'))).toBe(true);
    expect(mismatches).toHaveLength(2);
  });
});
