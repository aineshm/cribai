/**
 * Tests for AIN-98 addListing changes: source_url normalization (all three
 * uses — dedup SELECT, INSERT, 23505 race recovery) + units_of_interest
 * accumulation on both dedup-hit paths.
 *
 * Kept as its own file (not folded into add-listing.test.ts, already 800+
 * lines) — same DB-stub conventions as that file, trimmed to what this
 * scenario needs.
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
// DB stub — dedup/insert chain (mirrors add-listing.test.ts) + an
// update/read chain for the units_of_interest enrichment path.
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

interface EnrichReadChain {
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
}

function buildEnrichReadChain(rawExtraction: Record<string, unknown> | null): EnrichReadChain {
  const chain: EnrichReadChain = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { raw_extraction: rawExtraction }, error: null }),
  };
  chain.eq.mockReturnValue(chain);
  return chain;
}

interface UpdateChain {
  eq: ReturnType<typeof vi.fn>;
}

function buildUpdateChain(onUpdate: (payload: Record<string, unknown>) => void): {
  update: ReturnType<typeof vi.fn>;
} {
  const innerEq = vi.fn().mockResolvedValue({ error: null });
  const chain: UpdateChain = { eq: vi.fn().mockReturnValue({ eq: innerEq }) };
  const update = vi.fn((payload: Record<string, unknown>) => {
    onUpdate(payload);
    return chain;
  });
  return { update };
}

interface TableBuilder {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  _dedupChain: DedupChain;
  _insertSelectSingle: ReturnType<typeof vi.fn>;
  _capturedUpdatePayload: Record<string, unknown> | null;
}

function buildTableBuilder(opts: {
  dedupRow?: { id: string; extraction_confidence: number | null } | null;
  insertId?: string;
  insertError?: unknown;
  dedupError?: unknown;
  /** raw_extraction the enrichment read-back should return. */
  existingRawExtraction?: Record<string, unknown> | null;
} = {}): TableBuilder {
  const dedupChain = buildDedupChain(opts.dedupRow ?? null, opts.dedupError ?? null);
  const enrichReadChain = buildEnrichReadChain(opts.existingRawExtraction ?? {});

  const insertSelectSingle = vi.fn().mockResolvedValue({
    data: opts.insertError ? null : { id: opts.insertId ?? 'new-listing-id' },
    error: opts.insertError ?? null,
  });
  const insertChain = { select: vi.fn().mockReturnValue({ single: insertSelectSingle }) };

  let capturedUpdatePayload: Record<string, unknown> | null = null;
  const { update } = buildUpdateChain((payload) => {
    capturedUpdatePayload = payload;
  });

  // select() is called for BOTH the dedup query (select('id, extraction_confidence'))
  // and the enrichment read-back (select('raw_extraction')). Route on the
  // requested columns string so both coexist on one table-builder stub.
  const select = vi.fn((columns?: string) => {
    if (typeof columns === 'string' && columns.includes('raw_extraction')) {
      return enrichReadChain;
    }
    return dedupChain;
  });

  const tableBuilder = {
    select,
    insert: vi.fn().mockReturnValue(insertChain),
    update,
    _dedupChain: dedupChain,
    _insertSelectSingle: insertSelectSingle,
    get _capturedUpdatePayload() {
      return capturedUpdatePayload;
    },
  } as unknown as TableBuilder;

  return tableBuilder;
}

function buildDb(tableBuilder: TableBuilder): SupabaseClient {
  return { from: vi.fn().mockReturnValue(tableBuilder) } as unknown as SupabaseClient;
}

function makeDeps(
  overrides: Partial<AddListingDeps> & {
    tableBuilder?: TableBuilder;
    extractedListing?: ExtractedListing;
  } = {},
): AddListingDeps & { tableBuilder: TableBuilder } {
  const listing = overrides.extractedListing ?? makeExtractedListing();
  const extractFn = vi.fn().mockResolvedValue(listing);
  const tableBuilder = overrides.tableBuilder ?? buildTableBuilder();
  const db = buildDb(tableBuilder);

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
  });

  it('does NOT add a deep_extract key on fresh insert when selected_unit is absent (existing behavior pinned)', async () => {
    const tableBuilder = buildTableBuilder();
    const deps = makeDeps({ tableBuilder, extractedListing: makeExtractedListing() });

    await addListing('https://www.zillow.com/homedetails/x/1_zpid/', deps);

    const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
    const rawExtraction = row['raw_extraction'] as Record<string, unknown>;
    expect(rawExtraction).not.toHaveProperty('deep_extract');
  });

  it('appends to units_of_interest on the already-saved (fast dedup) path via a read-merge-write UPDATE', async () => {
    const existingRawExtraction = {
      extraction_method: 'json_ld',
      deep_extract: {
        floor_plans: [],
        units_of_interest: [
          { zpid: 'other-zpid', unit_number: 'Unit 100', viewed_at: '2026-07-01T00:00:00.000Z' },
        ],
      },
    };
    const tableBuilder = buildTableBuilder({
      dedupRow: { id: 'existing-id', extraction_confidence: 0.7 },
      existingRawExtraction,
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
    expect(tableBuilder.update).toHaveBeenCalledTimes(1);

    const updatePayload = tableBuilder._capturedUpdatePayload!;
    const nextRaw = updatePayload['raw_extraction'] as Record<string, unknown>;
    const nextDeepExtract = nextRaw['deep_extract'] as Record<string, unknown>;
    const nextUnits = nextDeepExtract['units_of_interest'] as Array<Record<string, unknown>>;

    // Both the pre-existing unit AND the newly-viewed unit are present —
    // never-wipe + append, not overwrite.
    expect(nextUnits).toHaveLength(2);
    expect(nextUnits.map((u) => u['zpid'])).toEqual(['other-zpid', '2056051402']);
    // Other deep_extract keys (floor_plans) are preserved.
    expect(nextDeepExtract['floor_plans']).toEqual([]);
  });

  it('dedupes by zpid: re-viewing the SAME unit moves it to the end instead of duplicating', async () => {
    const existingRawExtraction = {
      deep_extract: {
        units_of_interest: [
          { zpid: '2056051402', unit_number: 'Unit 1405 (stale)', viewed_at: '2026-07-01T00:00:00.000Z' },
          { zpid: 'other-zpid', unit_number: 'Unit 100', viewed_at: '2026-07-02T00:00:00.000Z' },
        ],
      },
    };
    const tableBuilder = buildTableBuilder({
      dedupRow: { id: 'existing-id', extraction_confidence: 0.7 },
      existingRawExtraction,
    });
    const deps = makeDeps({
      tableBuilder,
      extractedListing: makeExtractedListing({ selected_unit: SELECTED_UNIT_FIXTURE }),
    });

    await addListing('https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-2056051402', deps);

    const updatePayload = tableBuilder._capturedUpdatePayload!;
    const nextDeepExtract = (updatePayload['raw_extraction'] as Record<string, unknown>)['deep_extract'] as Record<string, unknown>;
    const nextUnits = nextDeepExtract['units_of_interest'] as Array<Record<string, unknown>>;

    expect(nextUnits).toHaveLength(2);
    // Deduped entry moved to the end (most-recent-last) with fresh unit_number.
    expect(nextUnits[nextUnits.length - 1]!['zpid']).toBe('2056051402');
    expect(nextUnits[nextUnits.length - 1]!['unit_number']).toBe('Unit 1405');
  });

  it('caps units_of_interest at 12 entries, dropping the oldest', async () => {
    const existingUnits = Array.from({ length: 12 }, (_, i) => ({
      zpid: `zpid-${i}`,
      viewed_at: `2026-07-0${(i % 9) + 1}T00:00:00.000Z`,
    }));
    const existingRawExtraction = { deep_extract: { units_of_interest: existingUnits } };
    const tableBuilder = buildTableBuilder({
      dedupRow: { id: 'existing-id', extraction_confidence: 0.7 },
      existingRawExtraction,
    });
    const deps = makeDeps({
      tableBuilder,
      extractedListing: makeExtractedListing({ selected_unit: SELECTED_UNIT_FIXTURE }),
    });

    await addListing('https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-2056051402', deps);

    const updatePayload = tableBuilder._capturedUpdatePayload!;
    const nextDeepExtract = (updatePayload['raw_extraction'] as Record<string, unknown>)['deep_extract'] as Record<string, unknown>;
    const nextUnits = nextDeepExtract['units_of_interest'] as Array<Record<string, unknown>>;

    expect(nextUnits).toHaveLength(12);
    // The oldest (zpid-0) was dropped; the new unit is last.
    expect(nextUnits.some((u) => u['zpid'] === 'zpid-0')).toBe(false);
    expect(nextUnits[nextUnits.length - 1]!['zpid']).toBe('2056051402');
  });

  it('appends via the 23505 race-recovery path too', async () => {
    const existingRawExtraction = { deep_extract: { units_of_interest: [] } };
    const tableBuilder = buildTableBuilder({ dedupRow: null, existingRawExtraction });
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
    expect(tableBuilder.update).toHaveBeenCalledTimes(1);
    const updatePayload = tableBuilder._capturedUpdatePayload!;
    const nextDeepExtract = (updatePayload['raw_extraction'] as Record<string, unknown>)['deep_extract'] as Record<string, unknown>;
    expect((nextDeepExtract['units_of_interest'] as unknown[]).length).toBe(1);
  });

  it('never fails the save when the enrichment UPDATE errors', async () => {
    const tableBuilder = buildTableBuilder({
      dedupRow: { id: 'existing-id', extraction_confidence: 0.7 },
      existingRawExtraction: {},
    });
    // Force the update chain to resolve with an error.
    tableBuilder.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: { message: 'boom' } }) }),
    });

    const deps = makeDeps({
      tableBuilder,
      extractedListing: makeExtractedListing({ selected_unit: SELECTED_UNIT_FIXTURE }),
    });

    await expect(
      addListing('https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-2056051402', deps),
    ).resolves.toMatchObject({ alreadySaved: true, listingId: 'existing-id' });
  });

  it('never fails the save when the enrichment read-back throws', async () => {
    const tableBuilder = buildTableBuilder({ dedupRow: { id: 'existing-id', extraction_confidence: 0.7 } });
    tableBuilder.select = vi.fn((columns?: string) => {
      if (typeof columns === 'string' && columns.includes('raw_extraction')) {
        throw new Error('connection reset');
      }
      return tableBuilder._dedupChain;
    });

    const deps = makeDeps({
      tableBuilder,
      extractedListing: makeExtractedListing({ selected_unit: SELECTED_UNIT_FIXTURE }),
    });

    await expect(
      addListing('https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-2056051402', deps),
    ).resolves.toMatchObject({ alreadySaved: true, listingId: 'existing-id' });
  });

  it('does NOT touch units_of_interest on the already-saved path when selected_unit is absent', async () => {
    const tableBuilder = buildTableBuilder({ dedupRow: { id: 'existing-id', extraction_confidence: 0.7 } });
    const deps = makeDeps({ tableBuilder, extractedListing: makeExtractedListing() });

    await addListing('https://www.zillow.com/homedetails/x/1_zpid/', deps);

    expect(tableBuilder.update).not.toHaveBeenCalled();
  });
});
