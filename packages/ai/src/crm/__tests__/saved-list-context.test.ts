/**
 * Unit tests for crm/saved-list-context.ts (AIN-91).
 *
 * All tests inject a fake `db` builder stub — no real Supabase connection.
 * The stub mirrors the supabase-js chainable-builder pattern used elsewhere
 * in this codebase (see rank-compare.test.ts): `from(table).select(...)...`
 * resolves a thenable to `{ data, count, error }`. This stub additionally
 * captures `.select()`'s options arg, every `.eq()` call, `.order()`, and
 * `.range()` so the fetch tests can assert the exact query shape (active-only
 * filter, saved_at desc, `.range(0, 25)`).
 */

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchSavedListContext,
  renderSavedListingsBlock,
  PROMPT_CONTEXT_LISTING_CAP,
} from '../saved-list-context';
import type { SavedListContext, SavedListingSummary } from '../saved-list-context';
import { makeCrmRow } from '../__fixtures__/crm-rows';

// ---------------------------------------------------------------------------
// Builder stub helpers
// ---------------------------------------------------------------------------

interface CapturedQuery {
  table?: string;
  selectArg?: string;
  selectOpts?: { count?: string; head?: boolean };
  eqCalls: Array<[string, unknown]>;
  orderCalls: Array<[string, { ascending?: boolean }]>;
  rangeCall?: [number, number];
}

/**
 * Build a chainable supabase-js builder stub that resolves (as a thenable)
 * to the given payload, capturing every call made on it along the way.
 */
function makeDbStub(payload: {
  data: unknown;
  count?: number | null;
  error: unknown;
}): { db: SupabaseClient; captured: CapturedQuery } {
  const captured: CapturedQuery = { eqCalls: [], orderCalls: [] };

  const builder = {
    select: vi.fn((arg?: string, opts?: { count?: string; head?: boolean }) => {
      captured.selectArg = arg;
      captured.selectOpts = opts;
      return builder;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      captured.eqCalls.push([col, val]);
      return builder;
    }),
    order: vi.fn((col: string, opts: { ascending?: boolean }) => {
      captured.orderCalls.push([col, opts]);
      return builder;
    }),
    range: vi.fn((from: number, to: number) => {
      captured.rangeCall = [from, to];
      return builder;
    }),
    // The builder itself is thenable so `await from(...).select(...)....` resolves.
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(payload).then(resolve, reject),
  };

  const db = {
    from: vi.fn((table: string) => {
      captured.table = table;
      return builder;
    }),
  } as unknown as SupabaseClient;

  return { db, captured };
}

const USER_ID = 'user-test-1';

function toSummaryRows(count: number): SavedListingSummary[] {
  return Array.from({ length: count }, (_, i) =>
    makeCrmRow({ id: `saved-${i}`, saved_at: `2026-0${(i % 9) + 1}-01T00:00:00Z` }),
  ).map((row) => ({
    id: row.id,
    nickname: row.nickname,
    title: row.title,
    address: row.address,
    rent: row.rent,
    status: row.status,
  }));
}

// ---------------------------------------------------------------------------
// fetchSavedListContext
// ---------------------------------------------------------------------------

describe('fetchSavedListContext', () => {
  it('queries crm_listings filtered to active + ordered saved_at desc + ranged to the cap', async () => {
    const rows = toSummaryRows(3);
    const { db, captured } = makeDbStub({ data: rows, count: 3, error: null });

    await fetchSavedListContext(db, USER_ID);

    expect(captured.table).toBe('crm_listings');
    expect(captured.selectArg).toBe('id, nickname, title, address, rent, status');
    expect(captured.selectOpts).toEqual({ count: 'exact' });
    expect(captured.eqCalls).toContainEqual(['user_id', USER_ID]);
    expect(captured.eqCalls).toContainEqual(['status', 'active']);
    expect(captured.orderCalls).toContainEqual(['saved_at', { ascending: false }]);
    expect(captured.rangeCall).toEqual([0, PROMPT_CONTEXT_LISTING_CAP]);
  });

  it('returns all rows with truncatedCount 0 when at or under the cap', async () => {
    const rows = toSummaryRows(10);
    const { db } = makeDbStub({ data: rows, count: 10, error: null });

    const result = await fetchSavedListContext(db, USER_ID);

    expect(result.listings).toHaveLength(10);
    expect(result.truncatedCount).toBe(0);
  });

  it('caps listings at 25 and computes an exact truncatedCount from the count field', async () => {
    // 30 total active listings; the stub returns cap+1 = 26 rows (as the real
    // .range(0, 25) query would), but the exact count (30) drives truncation.
    const rows = toSummaryRows(26);
    const { db } = makeDbStub({ data: rows, count: 30, error: null });

    const result = await fetchSavedListContext(db, USER_ID);

    expect(result.listings).toHaveLength(25);
    expect(result.truncatedCount).toBe(5);
  });

  it('returns an empty context and never throws when the query errors', async () => {
    const { db } = makeDbStub({ data: null, count: null, error: { message: 'boom' } });

    await expect(fetchSavedListContext(db, USER_ID)).resolves.toEqual({
      listings: [],
      truncatedCount: 0,
    });
  });

  it('returns an empty context and never throws when the db client itself throws', async () => {
    const db = {
      from: vi.fn(() => {
        throw new Error('connection refused');
      }),
    } as unknown as SupabaseClient;

    await expect(fetchSavedListContext(db, USER_ID)).resolves.toEqual({
      listings: [],
      truncatedCount: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// renderSavedListingsBlock
// ---------------------------------------------------------------------------

describe('renderSavedListingsBlock', () => {
  function ctx(listings: SavedListingSummary[], truncatedCount = 0): SavedListContext {
    return { listings, truncatedCount };
  }

  it('renders a "no saved listings yet" block with guidance when the list is empty', () => {
    const block = renderSavedListingsBlock(ctx([]));

    expect(block).toContain('no saved listings');
    expect(block).toContain('NEVER invent');
  });

  it('prefers nickname over title when both are present', () => {
    const block = renderSavedListingsBlock(
      ctx([
        {
          id: 'listing-1',
          nickname: 'The Blue House',
          title: 'Generic 2BR',
          address: '123 Main St',
          rent: 1200,
          status: 'active',
        },
      ]),
    );

    expect(block).toContain('"The Blue House"');
    expect(block).not.toContain('"Generic 2BR"');
  });

  it('falls back to title when nickname is absent', () => {
    const block = renderSavedListingsBlock(
      ctx([
        {
          id: 'listing-2',
          nickname: null,
          title: 'Studio on State St',
          address: '456 State St',
          rent: 900,
          status: 'active',
        },
      ]),
    );

    expect(block).toContain('"Studio on State St"');
  });

  it('includes the listing id verbatim', () => {
    const block = renderSavedListingsBlock(
      ctx([
        {
          id: 'a1b2c3-listing-id',
          nickname: 'Corner Unit',
          title: null,
          address: '789 University Ave',
          rent: 1500,
          status: 'active',
        },
      ]),
    );

    expect(block).toContain('id: a1b2c3-listing-id');
  });

  it('renders "?" for a null rent', () => {
    const block = renderSavedListingsBlock(
      ctx([
        {
          id: 'listing-3',
          nickname: 'No Rent Listed',
          title: null,
          address: '1 Unknown St',
          rent: null,
          status: 'active',
        },
      ]),
    );

    expect(block).toContain('$?/mo');
  });

  it('includes the truncation sentence only when truncatedCount > 0', () => {
    const withTruncation = renderSavedListingsBlock(
      ctx(
        [
          {
            id: 'listing-4',
            nickname: 'Kept',
            title: null,
            address: '1 Main St',
            rent: 1000,
            status: 'active',
          },
        ],
        5,
      ),
    );
    const withoutTruncation = renderSavedListingsBlock(
      ctx(
        [
          {
            id: 'listing-5',
            nickname: 'Kept',
            title: null,
            address: '1 Main St',
            rent: 1000,
            status: 'active',
          },
        ],
        0,
      ),
    );

    expect(withTruncation).toContain('...and 5 more saved listings not shown');
    expect(withoutTruncation).not.toContain('more saved listings not shown');
  });

  it('includes guidance to use exact ids and never invent one', () => {
    const block = renderSavedListingsBlock(
      ctx([
        {
          id: 'listing-6',
          nickname: 'Handle',
          title: null,
          address: '1 Main St',
          rent: 1000,
          status: 'active',
        },
      ]),
    );

    expect(block).toContain('EXACT id');
    expect(block).toContain('NEVER invent');
  });
});
