/**
 * Tests for the capture retention sweep (AIN-84; closes AIN-79).
 *
 * DB-rows-drive-deletion: rows older than the retention cutoff are listed,
 * their storage objects removed in batches, then the rows deleted. One bad
 * batch must not halt the sweep, and failed batches keep their rows so the
 * next nightly run retries them.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_RETENTION_DAYS,
  resolveRetentionDays,
  sweepExpiredCaptures,
} from '../cleanup-captures';

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

interface CaptureRowFixture {
  listing_id: string;
  storage_path: string;
}

function makeRows(count: number): CaptureRowFixture[] {
  return Array.from({ length: count }, (_, i) => ({
    listing_id: `listing-${i}`,
    storage_path: `user-1/listing-${i}.html.gz`,
  }));
}

function makeMockSupabase(opts: {
  rows: CaptureRowFixture[];
  selectError?: { message: string } | null;
  /** Batch indices (0-based, by call order) whose storage.remove fails. */
  removeFailsOnCall?: number[];
  /** Batch indices whose row delete fails. */
  deleteFailsOnCall?: number[];
}) {
  // The expired-row select paginates with .range() — PostgREST silently caps
  // unranged selects at 1000 rows, so the sweep pages explicitly (AIN-84).
  // Chain: .select().lt(col, cutoff).order().range(from, to)
  const rangeSpy = vi.fn(async (from: number, to: number) => {
    if (opts.selectError) return { data: null, error: opts.selectError };
    return { data: opts.rows.slice(from, to + 1), error: null };
  });
  const orderSpy = vi.fn(() => ({ range: rangeSpy }));
  const ltSpy = vi.fn(() => ({ order: orderSpy }));
  const selectSpy = vi.fn(() => ({ lt: ltSpy }));

  let removeCall = 0;
  const removeSpy = vi.fn(async (_paths: string[]) => {
    const call = removeCall++;
    if (opts.removeFailsOnCall?.includes(call)) {
      return { data: null, error: { message: `remove failed on batch ${call}` } };
    }
    return { data: [], error: null };
  });

  let deleteCall = 0;
  const inSpy = vi.fn(async (_col: string, _ids: string[]) => {
    const call = deleteCall++;
    if (opts.deleteFailsOnCall?.includes(call)) {
      return { data: null, error: { message: `delete failed on batch ${call}` } };
    }
    return { data: null, error: null };
  });
  const deleteSpy = vi.fn(() => ({ in: inSpy }));

  const client = {
    from: vi.fn(() => ({ select: selectSpy, delete: deleteSpy })),
    storage: { from: vi.fn(() => ({ remove: removeSpy })) },
  };

  return { client, ltSpy, rangeSpy, selectSpy, removeSpy, deleteSpy, inSpy };
}

// ---------------------------------------------------------------------------
// resolveRetentionDays — env validation at the boundary
// ---------------------------------------------------------------------------

describe('resolveRetentionDays', () => {
  it('defaults to 14 when unset', () => {
    expect(resolveRetentionDays(undefined)).toBe(DEFAULT_RETENTION_DAYS);
    expect(DEFAULT_RETENTION_DAYS).toBe(14);
  });

  it('parses a valid positive integer', () => {
    expect(resolveRetentionDays('7')).toBe(7);
    expect(resolveRetentionDays('30')).toBe(30);
  });

  it.each(['0', '-3', '1.5', 'abc', ''])(
    'falls back to the default (with a warning) for invalid value %j',
    (raw) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(resolveRetentionDays(raw)).toBe(DEFAULT_RETENTION_DAYS);
      if (raw !== '') expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    },
  );
});

// ---------------------------------------------------------------------------
// sweepExpiredCaptures
// ---------------------------------------------------------------------------

describe('sweepExpiredCaptures', () => {
  const NOW = new Date('2026-07-02T08:00:00.000Z');

  it('selects rows with captured_at older than now - retentionDays', async () => {
    const { client, ltSpy } = makeMockSupabase({ rows: [] });

    await sweepExpiredCaptures(client as never, { retentionDays: 14, now: NOW });

    // 14 days before NOW
    expect(ltSpy).toHaveBeenCalledWith('captured_at', '2026-06-18T08:00:00.000Z');
  });

  it('removes storage objects and deletes rows in batches', async () => {
    const rows = makeRows(5);
    const { client, removeSpy, inSpy } = makeMockSupabase({ rows });

    const summary = await sweepExpiredCaptures(client as never, {
      retentionDays: 14,
      now: NOW,
      batchSize: 2,
    });

    // 5 rows / batch of 2 → 3 batches
    expect(removeSpy).toHaveBeenCalledTimes(3);
    expect(removeSpy).toHaveBeenNthCalledWith(1, [
      'user-1/listing-0.html.gz',
      'user-1/listing-1.html.gz',
    ]);
    expect(removeSpy).toHaveBeenNthCalledWith(3, ['user-1/listing-4.html.gz']);

    expect(inSpy).toHaveBeenCalledTimes(3);
    expect(inSpy).toHaveBeenNthCalledWith(1, 'listing_id', ['listing-0', 'listing-1']);
    expect(inSpy).toHaveBeenNthCalledWith(3, 'listing_id', ['listing-4']);

    expect(summary).toEqual({ scanned: 5, removed: 5, failed: 0, dryRun: false });
  });

  it('isolates a failed batch: keeps its rows, continues with the rest', async () => {
    const rows = makeRows(4);
    const { client, removeSpy, inSpy } = makeMockSupabase({
      rows,
      removeFailsOnCall: [0], // first batch's storage remove fails
    });

    const summary = await sweepExpiredCaptures(client as never, {
      retentionDays: 14,
      now: NOW,
      batchSize: 2,
    });

    // Both batches attempted the storage remove…
    expect(removeSpy).toHaveBeenCalledTimes(2);
    // …but only the SECOND batch's rows were deleted (failed batch retries next run).
    expect(inSpy).toHaveBeenCalledTimes(1);
    expect(inSpy).toHaveBeenCalledWith('listing_id', ['listing-2', 'listing-3']);

    expect(summary).toEqual({ scanned: 4, removed: 2, failed: 2, dryRun: false });
  });

  it('counts a batch failed (rows retained implicitly retried) when the row delete fails after remove succeeds', async () => {
    const rows = makeRows(2);
    const { client, inSpy } = makeMockSupabase({
      rows,
      deleteFailsOnCall: [0],
    });

    const summary = await sweepExpiredCaptures(client as never, {
      retentionDays: 14,
      now: NOW,
      batchSize: 2,
    });

    expect(inSpy).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ scanned: 2, removed: 0, failed: 2, dryRun: false });
  });

  it('dry-run scans but neither removes objects nor deletes rows', async () => {
    const rows = makeRows(3);
    const { client, removeSpy, deleteSpy } = makeMockSupabase({ rows });

    const summary = await sweepExpiredCaptures(client as never, {
      retentionDays: 14,
      now: NOW,
      dryRun: true,
    });

    expect(removeSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 3, removed: 0, failed: 0, dryRun: true });
  });

  it('paginates the expired-row select past the PostgREST 1000-row cap', async () => {
    // 5 rows with a select page size of 2 → 3 range calls (last one short).
    const rows = makeRows(5);
    const { client, rangeSpy } = makeMockSupabase({ rows });

    const summary = await sweepExpiredCaptures(client as never, {
      retentionDays: 14,
      now: NOW,
      batchSize: 100,
      selectPageSize: 2,
    });

    expect(rangeSpy).toHaveBeenCalledTimes(3);
    expect(rangeSpy).toHaveBeenNthCalledWith(1, 0, 1);
    expect(rangeSpy).toHaveBeenNthCalledWith(2, 2, 3);
    expect(rangeSpy).toHaveBeenNthCalledWith(3, 4, 5);
    expect(summary).toEqual({ scanned: 5, removed: 5, failed: 0, dryRun: false });
  });

  it('returns a zero summary when nothing is expired', async () => {
    const { client, removeSpy } = makeMockSupabase({ rows: [] });

    const summary = await sweepExpiredCaptures(client as never, { retentionDays: 14, now: NOW });

    expect(removeSpy).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 0, removed: 0, failed: 0, dryRun: false });
  });

  it('throws when the expired-row select itself fails (sweep cannot proceed)', async () => {
    const { client } = makeMockSupabase({ rows: [], selectError: { message: 'db down' } });

    await expect(
      sweepExpiredCaptures(client as never, { retentionDays: 14, now: NOW }),
    ).rejects.toThrow(/db down/);
  });
});
