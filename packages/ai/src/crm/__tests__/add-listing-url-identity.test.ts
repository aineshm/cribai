/**
 * Tests for AIN-98 addListing changes: source_url normalization (all three
 * uses — dedup SELECT, INSERT, 23505 race recovery) + units_of_interest
 * accumulation on both dedup-hit paths.
 *
 * Kept as its own file (not folded into add-listing.test.ts, already 800+
 * lines) — same DB-stub conventions as that file, trimmed to what this
 * scenario needs.
 *
 * Review fix (HIGH, AIN-98 adjudication): units_of_interest accumulation on
 * the already-saved dedup paths used to be a JS-side read-merge-write
 * (SELECT raw_extraction, dedupe/append/cap in JS, UPDATE the whole
 * recomputed object) — a lost-update race between two concurrent writers.
 * It's now a single atomic `crm_append_unit_of_interest` RPC call
 * (migration 047) that does the dedupe/append/cap in ONE UPDATE statement
 * server-side. These tests assert the RPC call (function name + args), not
 * a captured UPDATE payload — the merge logic itself is pinned at the SQL
 * layer (047's own comments), not re-tested here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addListing } from '../add-listing';
import { normalizeSourceUrl } from '../source-url';
import type { AddListingDeps, ExtractedListing } from '../types';
import { makeExtractedListing } from '../__fixtures__/extracted-listing';
import { generateListingNickname } from '../nickname';

vi.mock('../nickname', () => ({
  generateListingNickname: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// DB stub — dedup/insert chain (mirrors add-listing.test.ts) + an `rpc` spy
// for the units_of_interest enrichment path.
// ---------------------------------------------------------------------------

interface DedupChain {
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
}

function buildDedupChain(
  dedupRow: { id: string; extraction_confidence: number | null } | null,
  dedupError: unknown = null,
): DedupChain {
  const chain: DedupChain = {
    eq: vi.fn(),
    neq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: dedupError ? null : dedupRow, error: dedupError }),
  };
  chain.eq.mockReturnValue(chain);
  chain.neq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

interface TableBuilder {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  _dedupChain: DedupChain;
  _insertSelectSingle: ReturnType<typeof vi.fn>;
}

function buildTableBuilder(opts: {
  dedupRow?: { id: string; extraction_confidence: number | null } | null;
  insertId?: string;
  insertError?: unknown;
  dedupError?: unknown;
} = {}): TableBuilder {
  const dedupChain = buildDedupChain(opts.dedupRow ?? null, opts.dedupError ?? null);

  const insertSelectSingle = vi.fn().mockResolvedValue({
    data: opts.insertError ? null : { id: opts.insertId ?? 'new-listing-id' },
    error: opts.insertError ?? null,
  });
  const insertChain = { select: vi.fn().mockReturnValue({ single: insertSelectSingle }) };

  const tableBuilder = {
    select: vi.fn().mockReturnValue(dedupChain),
    insert: vi.fn().mockReturnValue(insertChain),
    _dedupChain: dedupChain,
    _insertSelectSingle: insertSelectSingle,
  } as unknown as TableBuilder;

  return tableBuilder;
}

/** Build a Supabase client mock exposing both `.from()` and a spyable `.rpc()`. */
function buildDb(
  tableBuilder: TableBuilder,
  rpc: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ data: null, error: null }),
): SupabaseClient {
  return {
    from: vi.fn().mockReturnValue(tableBuilder),
    rpc,
  } as unknown as SupabaseClient;
}

function makeDeps(
  overrides: Partial<AddListingDeps> & {
    tableBuilder?: TableBuilder;
    extractedListing?: ExtractedListing;
    rpc?: ReturnType<typeof vi.fn>;
  } = {},
): AddListingDeps & { tableBuilder: TableBuilder } {
  const listing = overrides.extractedListing ?? makeExtractedListing();
  const extractFn = vi.fn().mockResolvedValue(listing);
  const tableBuilder = overrides.tableBuilder ?? buildTableBuilder();
  const db = overrides.db ?? buildDb(tableBuilder, overrides.rpc);

  const deps: AddListingDeps = {
    extract: extractFn,
    db,
    userId: 'user-abc',
    ...overrides,
  };
  return Object.assign(deps, { tableBuilder });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateListingNickname).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe('addListing — source_url normalization (AIN-98)', () => {
  const FRAGMENT_URL =
    'https://www.zillow.com/homedetails/Trinity-Apts/Ch4m2W_zpid/#udp-463380384';

  it('uses the normalized URL (fragment stripped) for the dedup SELECT', async () => {
    const tableBuilder = buildTableBuilder();
    const deps = makeDeps({ tableBuilder, extractedListing: makeExtractedListing({ source_url: FRAGMENT_URL }) });

    await addListing(FRAGMENT_URL, deps);

    expect(tableBuilder._dedupChain.eq).toHaveBeenCalledWith(
      'source_url',
      normalizeSourceUrl(FRAGMENT_URL),
    );
    expect(normalizeSourceUrl(FRAGMENT_URL)).not.toContain('#');
  });

  it('inserts the normalized URL as source_url, not the raw fragment-bearing URL', async () => {
    const tableBuilder = buildTableBuilder();
    const deps = makeDeps({ tableBuilder, extractedListing: makeExtractedListing({ source_url: FRAGMENT_URL }) });

    await addListing(FRAGMENT_URL, deps);

    const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row['source_url']).toBe(normalizeSourceUrl(FRAGMENT_URL));
    expect(row['source_url']).not.toContain('#');
  });

  it('a bare re-save of the same building (no fragment) resolves to the SAME normalized identity as the fragment variant', async () => {
    const bareUrl = 'https://www.zillow.com/homedetails/Trinity-Apts/Ch4m2W_zpid/';
    expect(normalizeSourceUrl(bareUrl)).toBe(normalizeSourceUrl(FRAGMENT_URL));
  });

  it('uses the normalized URL for the 23505 race-recovery SELECT', async () => {
    const tableBuilder = buildTableBuilder({ dedupRow: null });
    tableBuilder._dedupChain.maybeSingle
      .mockReset()
      .mockResolvedValueOnce({ data: null, error: null }) // fast dedup: nothing yet
      .mockResolvedValueOnce({ data: { id: 'race-winner', extraction_confidence: 0.6 }, error: null }); // race recovery
    tableBuilder._insertSelectSingle.mockReset().mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });

    const deps = makeDeps({
      tableBuilder,
      extractedListing: makeExtractedListing({ source_url: FRAGMENT_URL }),
    });

    const result = await addListing(FRAGMENT_URL, deps);

    expect(result.alreadySaved).toBe(true);
    expect(result.listingId).toBe('race-winner');
    // Both dedup SELECT calls (fast path + race recovery) queried the
    // normalized URL — asserted via the shared dedup chain's eq mock.
    expect(tableBuilder._dedupChain.eq).toHaveBeenCalledWith(
      'source_url',
      normalizeSourceUrl(FRAGMENT_URL),
    );
  });

  it('exposes the normalized URL on the result (for callers like the ingest route to enqueue missions against)', async () => {
    const tableBuilder = buildTableBuilder();
    const deps = makeDeps({ tableBuilder, extractedListing: makeExtractedListing({ source_url: FRAGMENT_URL }) });

    const result = await addListing(FRAGMENT_URL, deps);

    expect(result.normalizedUrl).toBe(normalizeSourceUrl(FRAGMENT_URL));
  });

  it('a pre-normalization-era row (raw fragment-bearing source_url stored) does not collide — treated as a genuinely different string until backfilled (documented pre-backfill semantics)', async () => {
    // The dedup SELECT now queries the NORMALIZED url. A legacy row stored
    // with the raw (un-normalized) string will not match until migration 047
    // backfills it — this is the documented, accepted pre-backfill gap.
    const tableBuilder = buildTableBuilder({ dedupRow: null }); // simulates "no match" pre-backfill
    const deps = makeDeps({ tableBuilder, extractedListing: makeExtractedListing({ source_url: FRAGMENT_URL }) });

    const result = await addListing(FRAGMENT_URL, deps);

    expect(result.alreadySaved).toBe(false);
    expect(tableBuilder.insert).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// units_of_interest accumulation
// ---------------------------------------------------------------------------

const SELECTED_UNIT_FIXTURE = {
  zpid: '2056051402',
  unit_number: 'Unit 1405',
  plan_name: 'S1',
  price: 1825,
  bedrooms: 0,
  bathrooms: 1,
  sqft: 547,
  floor: null,
  availability: '2026-07-18',
};

describe('addListing — units_of_interest accumulation (AIN-98)', () => {
  it('seeds deep_extract.units_of_interest with one entry on a fresh insert when selected_unit is present', async () => {
    const tableBuilder = buildTableBuilder();
    const deps = makeDeps({
      tableBuilder,
      extractedListing: makeExtractedListing({ selected_unit: SELECTED_UNIT_FIXTURE }),
    });

    await addListing('https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-2056051402', deps);

    const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
    const rawExtraction = row['raw_extraction'] as Record<string, unknown>;
    const deepExtract = rawExtraction['deep_extract'] as Record<string, unknown>;
    expect(deepExtract).toBeDefined();
    const units = deepExtract['units_of_interest'] as Array<Record<string, unknown>>;
    expect(units).toHaveLength(1);
    expect(units[0]!['zpid']).toBe('2056051402');
    expect(units[0]!['unit_number']).toBe('Unit 1405');
    expect(typeof units[0]!['viewed_at']).toBe('string');

    // A fresh insert seeds the array directly in the insert row — it never
    // needs the enrichment RPC (no existing row to append onto).
    expect(deps.db.rpc).not.toHaveBeenCalled();
  });

  it('does NOT add a deep_extract key on fresh insert when selected_unit is absent (existing behavior pinned)', async () => {
    const tableBuilder = buildTableBuilder();
    const deps = makeDeps({ tableBuilder, extractedListing: makeExtractedListing() });

    await addListing('https://www.zillow.com/homedetails/x/1_zpid/', deps);

    const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
    const rawExtraction = row['raw_extraction'] as Record<string, unknown>;
    expect(rawExtraction).not.toHaveProperty('deep_extract');
  });

  it('appends to units_of_interest on the already-saved (fast dedup) path via the atomic crm_append_unit_of_interest RPC', async () => {
    const tableBuilder = buildTableBuilder({
      dedupRow: { id: 'existing-id', extraction_confidence: 0.7 },
    });
    const deps = makeDeps({
      tableBuilder,
      extractedListing: makeExtractedListing({ selected_unit: SELECTED_UNIT_FIXTURE }),
    });

    const result = await addListing(
      'https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-2056051402',
      deps,
    );

    expect(result.alreadySaved).toBe(true);
    // The read-merge-write UPDATE is gone — a single RPC call carries the
    // validated, timestamped unit; the SQL function (migration 047) owns
    // the dedupe/append/cap logic atomically, server-side.
    expect(deps.db.rpc).toHaveBeenCalledTimes(1);
    const [fnName, args] = (deps.db.rpc as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(fnName).toBe('crm_append_unit_of_interest');
    expect(args).toMatchObject({
      p_listing_id: 'existing-id',
      p_unit: expect.objectContaining({
        zpid: '2056051402',
        unit_number: 'Unit 1405',
      }),
    });
    expect(typeof (args as { p_unit: { viewed_at: string } }).p_unit.viewed_at).toBe('string');
  });

  it('appends via the 23505 race-recovery path too, against the RACE WINNER id', async () => {
    const tableBuilder = buildTableBuilder({ dedupRow: null });
    tableBuilder._dedupChain.maybeSingle
      .mockReset()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'race-winner', extraction_confidence: 0.6 }, error: null });
    tableBuilder._insertSelectSingle.mockReset().mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });

    const deps = makeDeps({
      tableBuilder,
      extractedListing: makeExtractedListing({ selected_unit: SELECTED_UNIT_FIXTURE }),
    });

    const result = await addListing(
      'https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-2056051402',
      deps,
    );

    expect(result.alreadySaved).toBe(true);
    expect(deps.db.rpc).toHaveBeenCalledTimes(1);
    const [fnName, args] = (deps.db.rpc as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(fnName).toBe('crm_append_unit_of_interest');
    expect(args).toMatchObject({ p_listing_id: 'race-winner' });
  });

  it('validates the unit with SelectedUnitSchema before calling the RPC — a malformed unit never calls it', async () => {
    const tableBuilder = buildTableBuilder({
      dedupRow: { id: 'existing-id', extraction_confidence: 0.7 },
    });
    const deps = makeDeps({
      tableBuilder,
      // zpid must be a non-empty string per RawSelectedUnitSchema — an
      // empty string fails validation, degrading to "nothing to append".
      extractedListing: makeExtractedListing({
        selected_unit: { ...SELECTED_UNIT_FIXTURE, zpid: '' },
      }),
    });

    const result = await addListing(
      'https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-2056051402',
      deps,
    );

    expect(result.alreadySaved).toBe(true);
    expect(deps.db.rpc).not.toHaveBeenCalled();
  });

  it('never fails the save when the enrichment RPC call resolves with an error', async () => {
    const tableBuilder = buildTableBuilder({
      dedupRow: { id: 'existing-id', extraction_confidence: 0.7 },
    });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const deps = makeDeps({
      tableBuilder,
      rpc,
      extractedListing: makeExtractedListing({ selected_unit: SELECTED_UNIT_FIXTURE }),
    });

    await expect(
      addListing('https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-2056051402', deps),
    ).resolves.toMatchObject({ alreadySaved: true, listingId: 'existing-id' });
  });

  it('never fails the save when the enrichment RPC call throws', async () => {
    const tableBuilder = buildTableBuilder({
      dedupRow: { id: 'existing-id', extraction_confidence: 0.7 },
    });
    const rpc = vi.fn().mockRejectedValue(new Error('connection reset'));
    const deps = makeDeps({
      tableBuilder,
      rpc,
      extractedListing: makeExtractedListing({ selected_unit: SELECTED_UNIT_FIXTURE }),
    });

    await expect(
      addListing('https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-2056051402', deps),
    ).resolves.toMatchObject({ alreadySaved: true, listingId: 'existing-id' });
  });

  it('does NOT call the enrichment RPC on the already-saved path when selected_unit is absent', async () => {
    const tableBuilder = buildTableBuilder({ dedupRow: { id: 'existing-id', extraction_confidence: 0.7 } });
    const deps = makeDeps({ tableBuilder, extractedListing: makeExtractedListing() });

    await addListing('https://www.zillow.com/homedetails/x/1_zpid/', deps);

    expect(deps.db.rpc).not.toHaveBeenCalled();
  });
});
