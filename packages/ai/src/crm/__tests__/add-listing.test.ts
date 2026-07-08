/**
 * Tests for the `addListing` CRM workflow (AIN-15, Track C Phase 1).
 *
 * Follows TDD: tests assert the contract; the implementation lives in
 * `packages/ai/src/crm/add-listing.ts`.
 *
 * Supabase stub pattern: two independent chains from `from('crm_listings')`:
 *   - SELECT chain (dedup):  `.select().eq().eq().neq().maybeSingle()`
 *   - INSERT chain:          `.insert().select().single()`
 *
 * The `from` mock is configured per test so each scenario can control
 * both chains independently.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AddListingError, addListing } from '../add-listing';
import { ExtractionError } from '../../extraction';
import type { AddListingDeps, ExtractedListing } from '../types';
import {
  highConfidenceListing,
  mediumConfidenceListing,
  lowConfidenceOgOnly,
} from '../__fixtures__/extracted-listing';
import { generateListingNickname } from '../nickname';

// AIN-95: addListing schedules background nickname generation on new saves.
// Mock the generator so tests assert scheduling/wiring, not the generator's
// own behavior (that is covered exhaustively in nickname.test.ts).
vi.mock('../nickname', () => ({
  generateListingNickname: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// DB builder stub helpers
// ---------------------------------------------------------------------------

interface DedupChain {
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  // FIX 4: order+limit added before .maybeSingle() to handle multiple non-archived rows
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
}

interface InsertSelectChain {
  single: ReturnType<typeof vi.fn>;
}

interface InsertChain {
  select: ReturnType<typeof vi.fn>;
}

interface TableBuilder {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  _dedupChain: DedupChain;
  _insertChain: InsertChain;
  _insertSelectChain: InsertSelectChain;
}

/**
 * Build a Supabase table-builder stub whose dedup SELECT and INSERT chains
 * are independently inspectable.
 *
 * @param dedupRow  Row returned by `.maybeSingle()`. null → no existing row.
 * @param insertId  Row id returned by `.single()` after insert. 'new-id' by default.
 * @param insertError  Error object to return from insert `.single()`. null → success.
 * @param dedupError   Error object to return from dedup `.maybeSingle()`. null → success.
 */
function buildTableBuilder(
  dedupRow: { id: string; extraction_confidence: number | null } | null = null,
  insertId = 'new-listing-id',
  insertError: unknown = null,
  dedupError: unknown = null,
): TableBuilder {
  const dedupChain: DedupChain = {
    eq: vi.fn(),
    neq: vi.fn(),
    // FIX 4: order+limit must be chainable before .maybeSingle()
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: dedupError ? null : dedupRow, error: dedupError }),
  };
  // Chain: select().eq().eq().neq().order().limit().maybeSingle()
  dedupChain.eq.mockReturnValue(dedupChain);
  dedupChain.neq.mockReturnValue(dedupChain);
  dedupChain.order.mockReturnValue(dedupChain);
  dedupChain.limit.mockReturnValue(dedupChain);

  const insertSelectChain: InsertSelectChain = {
    single: vi.fn().mockResolvedValue({
      data: insertError ? null : { id: insertId },
      error: insertError,
    }),
  };
  const insertChain: InsertChain = {
    select: vi.fn().mockReturnValue(insertSelectChain),
  };

  // select() returns the dedup chain; insert() returns the insert chain.
  const tableBuilder: TableBuilder = {
    select: vi.fn().mockReturnValue(dedupChain),
    insert: vi.fn().mockReturnValue(insertChain),
    _dedupChain: dedupChain,
    _insertChain: insertChain,
    _insertSelectChain: insertSelectChain,
  };

  return tableBuilder;
}

/**
 * Build a minimal SupabaseClient mock from a pre-configured table builder.
 */
function buildDb(tableBuilder: TableBuilder): SupabaseClient {
  return { from: vi.fn().mockReturnValue(tableBuilder) } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Default deps factory
// ---------------------------------------------------------------------------

function makeDeps(
  overrides: Partial<AddListingDeps> & {
    tableBuilder?: TableBuilder;
    extractedListing?: ExtractedListing;
    extractError?: unknown;
  } = {},
): AddListingDeps & { tableBuilder: TableBuilder } {
  const listing = overrides.extractedListing ?? highConfidenceListing;
  const extractFn = overrides.extractError
    ? vi.fn().mockRejectedValue(overrides.extractError)
    : vi.fn().mockResolvedValue(listing);

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const INPUT_URL = 'https://zillow.com/homedetails/123-main-st/123456789_zpid/';

describe('addListing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateListingNickname).mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path (highConfidenceListing)', () => {
    it('inserts correctly mapped row and returns success result', async () => {
      const onSaved = vi.fn();
      const deps = makeDeps({ onSaved });

      const result = await addListing(INPUT_URL, deps);

      // Return shape
      expect(result.listingId).toBe('new-listing-id');
      expect(result.alreadySaved).toBe(false);
      expect(result.confidence).toBe(0.9); // high → 0.9

      // Insert called exactly once
      expect(deps.tableBuilder.insert).toHaveBeenCalledTimes(1);

      const row = deps.tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;

      // Key field mappings from the spec
      expect(row['source_url']).toBe(INPUT_URL);
      expect(row['user_id']).toBe('user-abc');
      expect(row['rent']).toBe(1400);             // price → rent
      expect(row['sqft']).toBe(850);              // square_feet → sqft
      expect(row['extraction_confidence']).toBe(0.9);
      expect(Array.isArray(row['amenities'])).toBe(true);
      expect(Array.isArray(row['photo_urls'])).toBe(true);

      // raw_extraction stashes all three fields
      const rawExtraction = row['raw_extraction'] as Record<string, unknown>;
      expect(rawExtraction).toHaveProperty('raw_json_ld');
      expect(rawExtraction).toHaveProperty('raw_og');
      expect(rawExtraction).toHaveProperty('extraction_method');

      // onSaved fired with the new id
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledWith('new-listing-id');
    });
  });

  // -------------------------------------------------------------------------
  // dryRun eval kill-switch
  // -------------------------------------------------------------------------

  describe('dryRun', () => {
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    it('skips extract + dedup + insert and returns synthetic success', async () => {
      const onSaved = vi.fn();
      const deps = makeDeps({ dryRun: true, onSaved });

      const result = await addListing(INPUT_URL, deps);

      // Synthetic-success shape: valid UUID, not already saved, mid confidence.
      expect(result.listingId).toMatch(UUID_RE);
      expect(result.alreadySaved).toBe(false);
      expect(typeof result.confidence).toBe('number');

      // No network fetch (extract), no DB reads, no insert, no onSaved.
      expect(deps.extract).not.toHaveBeenCalled();
      expect((deps.db.from as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
      expect(deps.tableBuilder.insert).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('returns a fresh UUID per call', async () => {
      const a = await addListing(INPUT_URL, makeDeps({ dryRun: true }));
      const b = await addListing(INPUT_URL, makeDeps({ dryRun: true }));
      expect(a.listingId).not.toBe(b.listingId);
    });

    it('prod path still fires when dryRun is absent (regression guard)', async () => {
      const deps = makeDeps(); // dryRun undefined
      await addListing(INPUT_URL, deps);
      expect(deps.extract).toHaveBeenCalledTimes(1);
      expect(deps.tableBuilder.insert).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Coordinate resolution
  // -------------------------------------------------------------------------

  describe('coordinate resolution', () => {
    it('uses extracted lat/lng and does NOT call geocode', async () => {
      const geocode = vi.fn();
      const deps = makeDeps({ geocode, placesApiKey: 'key-abc' });

      await addListing(INPUT_URL, deps);

      expect(geocode).not.toHaveBeenCalled();

      const row = deps.tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
      // highConfidenceListing has lat=43.0731, lng=-89.4012
      // PostGIS: POINT(lng lat) → longitude first
      expect(row['coordinates']).toBe('SRID=4326;POINT(-89.4012 43.0731)');
    });

    it('calls geocode when extraction has no lat/lng but has address + apiKey', async () => {
      const geocode = vi.fn().mockResolvedValue({ latitude: 43.1, longitude: -89.5 });
      const tableBuilder = buildTableBuilder();
      const deps = makeDeps({
        extractedListing: mediumConfidenceListing, // no lat/lng, has address
        tableBuilder,
        geocode,
        placesApiKey: 'key-abc',
      });

      await addListing(INPUT_URL, deps);

      expect(geocode).toHaveBeenCalledTimes(1);
      expect(geocode).toHaveBeenCalledWith(mediumConfidenceListing.address, 'key-abc');

      const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
      expect(row['coordinates']).toBe('SRID=4326;POINT(-89.5 43.1)');
    });

    it('omits coordinates key entirely when no lat/lng and no geocode dep', async () => {
      const tableBuilder = buildTableBuilder();
      const deps = makeDeps({
        extractedListing: lowConfidenceOgOnly, // no lat/lng, no address
        tableBuilder,
        // no geocode, no placesApiKey
      });

      await addListing(INPUT_URL, deps);

      const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
      expect(row).not.toHaveProperty('coordinates');
    });

    it('omits coordinates when medium listing has address but no apiKey', async () => {
      // geocode dep present but no apiKey → should not call geocode
      const geocode = vi.fn();
      const tableBuilder = buildTableBuilder();
      const deps = makeDeps({
        extractedListing: mediumConfidenceListing,
        tableBuilder,
        geocode,
        // no placesApiKey
      });

      await addListing(INPUT_URL, deps);

      expect(geocode).not.toHaveBeenCalled();
      const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
      expect(row).not.toHaveProperty('coordinates');
    });
  });

  // -------------------------------------------------------------------------
  // Dedup
  // -------------------------------------------------------------------------

  describe('dedup', () => {
    it('returns existing row without inserting when active row found', async () => {
      const onSaved = vi.fn();
      const existingRow = { id: 'existing-id', extraction_confidence: 0.7 };
      const tableBuilder = buildTableBuilder(existingRow);
      const deps = makeDeps({ tableBuilder, onSaved });

      const result = await addListing(INPUT_URL, deps);

      expect(result.listingId).toBe('existing-id');
      expect(result.alreadySaved).toBe(true);
      expect(result.confidence).toBe(0.7);

      // No insert
      expect(tableBuilder.insert).not.toHaveBeenCalled();
      // onSaved NOT called on dedup
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('uses extracted confidence when existing row has null extraction_confidence', async () => {
      const existingRow = { id: 'existing-id', extraction_confidence: null };
      const tableBuilder = buildTableBuilder(existingRow);
      const deps = makeDeps({ tableBuilder }); // highConfidenceListing → 0.9

      const result = await addListing(INPUT_URL, deps);

      expect(result.confidence).toBe(0.9);
    });

    it('filters dedup query by status != archived (neq called with archived)', async () => {
      const tableBuilder = buildTableBuilder();
      const deps = makeDeps({ tableBuilder });

      await addListing(INPUT_URL, deps);

      // neq should be called with 'status', 'archived'
      expect(tableBuilder._dedupChain.neq).toHaveBeenCalledWith('status', 'archived');
    });

    it('proceeds with insert when only an archived row exists (dedup returns null)', async () => {
      // The query filters status != 'archived', so an archived row won't be returned.
      // Simulate: no row returned (dedup query already excludes archived rows server-side)
      const tableBuilder = buildTableBuilder(null); // dedup returns null → insert proceeds
      const deps = makeDeps({ tableBuilder });

      const result = await addListing(INPUT_URL, deps);

      expect(result.alreadySaved).toBe(false);
      expect(tableBuilder.insert).toHaveBeenCalledTimes(1);
    });

    // FIX 4: multiple non-archived rows (e.g. declined + active) → query uses order+limit(1) so
    // maybeSingle doesn't throw PGRST116. Stub returns a single row via the limited query.
    it('FIX 4 — returns alreadySaved:true without throwing when dedup stub returns one row (multiple non-archived scenario)', async () => {
      // In production, .order('saved_at', {ascending:false}).limit(1) ensures we always get ≤1 row.
      // The stub already returns one row via maybeSingle (simulating the limited query result).
      const existingRow = { id: 'multi-row-id', extraction_confidence: 0.8 };
      const tableBuilder = buildTableBuilder(existingRow);
      const deps = makeDeps({ tableBuilder });

      const result = await addListing(INPUT_URL, deps);

      expect(result.alreadySaved).toBe(true);
      expect(result.listingId).toBe('multi-row-id');
      // Verify the dedup chain includes order and limit calls
      expect(tableBuilder._dedupChain.order).toHaveBeenCalledWith('saved_at', { ascending: false });
      expect(tableBuilder._dedupChain.limit).toHaveBeenCalledWith(1);
    });

    // FIX 4 regression: dedup query error must throw AddListingError, NOT fall through to insert
    it('throws AddListingError(db_error) when dedup maybeSingle returns an error, and does NOT insert', async () => {
      const dedupError = { message: 'connection lost', code: 'PGRST301' };
      const tableBuilder = buildTableBuilder(null, 'new-listing-id', null, dedupError);
      const onSaved = vi.fn();
      const deps = makeDeps({ tableBuilder, onSaved });

      await expect(addListing(INPUT_URL, deps)).rejects.toSatisfy(
        (err: unknown) => {
          if (!(err instanceof AddListingError)) return false;
          return (
            err.code === 'db_error' &&
            err.userMessage.includes("couldn't save")
          );
        },
      );

      // Insert must NOT have been called (we caught the error before Step 4)
      expect(tableBuilder.insert).not.toHaveBeenCalled();
      // onSaved must NOT be called
      expect(onSaved).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // ExtractionError mapping
  // -------------------------------------------------------------------------

  describe('ExtractionError mapping', () => {
    const ERROR_CASES: Array<{
      code: 'fetch_blocked' | 'fetch_failed' | 'parse_failed' | 'no_listing_data';
      expectedCode: string;
      expectedMessageFragment: string;
    }> = [
      {
        code: 'fetch_blocked',
        expectedCode: 'fetch_blocked',
        expectedMessageFragment: 'blocking automated reads',
      },
      {
        code: 'fetch_failed',
        expectedCode: 'fetch_failed',
        expectedMessageFragment: "couldn't reach",
      },
      {
        code: 'parse_failed',
        expectedCode: 'parse_failed',
        expectedMessageFragment: "doesn't look like a valid listing URL",
      },
      {
        code: 'no_listing_data',
        expectedCode: 'no_listing_data',
        expectedMessageFragment: "couldn't find listing details",
      },
    ];

    for (const { code, expectedCode, expectedMessageFragment } of ERROR_CASES) {
      it(`wraps ExtractionError(${code}) as AddListingError`, async () => {
        const extractionErr = new ExtractionError(code, `test error for ${code}`, INPUT_URL);
        const deps = makeDeps({ extractError: extractionErr });

        await expect(addListing(INPUT_URL, deps)).rejects.toSatisfy(
          (err: unknown) => {
            if (!(err instanceof AddListingError)) return false;
            return (
              err.code === expectedCode &&
              err.userMessage.includes(expectedMessageFragment)
            );
          },
        );
      });
    }

    it('defaults to fetch_failed code for unknown errors without a code property', async () => {
      const unknownErr = new Error('network blew up');
      const deps = makeDeps({ extractError: unknownErr });

      await expect(addListing(INPUT_URL, deps)).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof AddListingError && err.code === 'fetch_failed',
      );
    });
  });

  // -------------------------------------------------------------------------
  // DB insert error
  // -------------------------------------------------------------------------

  describe('DB insert error', () => {
    it('throws AddListingError with db_error code when insert fails (non-23505)', async () => {
      const onSaved = vi.fn();
      // A generic DB error (not a unique-violation) — must still hard-fail,
      // not be swallowed into an already-saved response.
      const dbError = { message: 'connection reset', code: '08006' };
      const tableBuilder = buildTableBuilder(null, 'irrelevant', dbError);
      const deps = makeDeps({ tableBuilder, onSaved });

      await expect(addListing(INPUT_URL, deps)).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof AddListingError &&
          err.code === 'db_error' &&
          err.userMessage.includes("couldn't save"),
      );

      // onSaved must NOT be called when insert fails
      expect(onSaved).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // AIN-98: 23505 unique-violation race — the migration 046 dedup index
  // means a concurrent double-save can now fail the INSERT with 23505
  // instead of both racing past the earlier SELECT dedup. That must resolve
  // to the SAME "already saved" response shape the SELECT path returns, not
  // a thrown error.
  // -------------------------------------------------------------------------

  describe('23505 unique-violation race (AIN-98)', () => {
    it('resolves to the same already-saved shape as the SELECT dedup path', async () => {
      const raceWinnerRow = { id: 'race-winner-id', extraction_confidence: 0.6 };
      const tableBuilder = buildTableBuilder(null); // first SELECT finds nothing → insert proceeds
      // The dedup SELECT chain's maybeSingle is called twice in this
      // scenario: once before the insert (finds nothing, race not yet
      // landed) and once again as race-recovery after the 23505 (finds the
      // concurrent insert's winning row).
      tableBuilder._dedupChain.maybeSingle
        .mockReset()
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: raceWinnerRow, error: null });

      const insertError = { message: 'duplicate key value violates unique constraint', code: '23505' };
      tableBuilder._insertSelectChain.single.mockReset().mockResolvedValueOnce({
        data: null,
        error: insertError,
      });

      const onSaved = vi.fn();
      const scheduleBackground = vi.fn();
      const deps = makeDeps({ tableBuilder, onSaved, scheduleBackground });

      const result = await addListing(INPUT_URL, deps);

      expect(result).toEqual({
        listingId: 'race-winner-id',
        alreadySaved: true,
        confidence: 0.6,
      });

      // Same contract as the SELECT dedup path: no post-save hooks on an
      // already-saved response.
      expect(onSaved).not.toHaveBeenCalled();
      expect(scheduleBackground).not.toHaveBeenCalled();
      expect(generateListingNickname).not.toHaveBeenCalled();
    });

    it('uses the extracted confidence when the race-recovery row has null extraction_confidence', async () => {
      const raceWinnerRow = { id: 'race-winner-id', extraction_confidence: null };
      const tableBuilder = buildTableBuilder(null);
      tableBuilder._dedupChain.maybeSingle
        .mockReset()
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: raceWinnerRow, error: null });

      const insertError = { code: '23505', message: 'duplicate key' };
      tableBuilder._insertSelectChain.single.mockReset().mockResolvedValueOnce({
        data: null,
        error: insertError,
      });

      const deps = makeDeps({ tableBuilder }); // highConfidenceListing → 0.9

      const result = await addListing(INPUT_URL, deps);

      expect(result.alreadySaved).toBe(true);
      expect(result.confidence).toBe(0.9);
    });

    it('still throws AddListingError(db_error) if the race-recovery SELECT itself errors', async () => {
      const tableBuilder = buildTableBuilder(null);
      const raceRecoveryError = { message: 'connection lost', code: 'PGRST301' };
      tableBuilder._dedupChain.maybeSingle
        .mockReset()
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: raceRecoveryError });

      const insertError = { code: '23505', message: 'duplicate key' };
      tableBuilder._insertSelectChain.single.mockReset().mockResolvedValueOnce({
        data: null,
        error: insertError,
      });

      const deps = makeDeps({ tableBuilder });

      await expect(addListing(INPUT_URL, deps)).rejects.toSatisfy(
        (err: unknown) => err instanceof AddListingError && err.code === 'db_error',
      );
    });

    it('still throws AddListingError(db_error) if the race-recovery SELECT finds no row', async () => {
      // Review fix (AIN-98 adjudication): migration 046's unique index now
      // carries the SAME `status <> 'archived'` predicate as this recovery
      // SELECT's `.neq('status', 'archived')`, so a 23505 can only ever come
      // from a non-archived collision — the recovery SELECT will find that
      // winning row in the overwhelming case. This branch is therefore a
      // last-resort safety net for a residual race-within-a-race (e.g. the
      // winner gets archived/deleted in the instant between the 23505 and
      // this recovery SELECT), not a workaround for the archived-row bug the
      // unpatched index predicate used to cause. Still must never silently
      // swallow — degrade to the generic db error.
      const tableBuilder = buildTableBuilder(null);
      tableBuilder._dedupChain.maybeSingle
        .mockReset()
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      const insertError = { code: '23505', message: 'duplicate key' };
      tableBuilder._insertSelectChain.single.mockReset().mockResolvedValueOnce({
        data: null,
        error: insertError,
      });

      const deps = makeDeps({ tableBuilder });

      await expect(addListing(INPUT_URL, deps)).rejects.toSatisfy(
        (err: unknown) => err instanceof AddListingError && err.code === 'db_error',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Review fix (CRITICAL, AIN-98 adjudication): migration 046's original
  // unique index predicate (`WHERE source_url IS NOT NULL`, no status
  // clause) let an ARCHIVED row permanently occupy the (user_id, source_url)
  // slot — re-saving the same URL after archiving would 23505 at INSERT,
  // and the recovery SELECT (which excludes archived rows, matching 037's
  // original "re-save after archive" contract) would find nothing, falling
  // through to a generic db_error forever. The corrected predicate
  // (`WHERE source_url IS NOT NULL AND status <> 'archived'`) means an
  // archived row no longer occupies the slot at the DB level, so this save
  // must proceed as an ordinary new-row insert — never a 23505/race-recovery
  // path. This pins that app-layer contract: the mock deliberately configures
  // NO insertError, because with the corrected predicate the unique index
  // would never fire for this scenario in the first place.
  // -------------------------------------------------------------------------

  describe('archive→re-save contract (migration 046 status-aware predicate)', () => {
    it('proceeds as a plain new-row insert when only an archived row exists for the URL — never 23505', async () => {
      // The dedup SELECT already excludes archived rows (`.neq('status',
      // 'archived')`), so it returns null even though an archived row for
      // this URL exists server-side — exactly like the corrected unique
      // index no longer indexing that row.
      const tableBuilder = buildTableBuilder(null, 'resaved-after-archive-id');
      const onSaved = vi.fn();
      const deps = makeDeps({ tableBuilder, onSaved });

      const result = await addListing(INPUT_URL, deps);

      expect(result).toEqual({
        listingId: 'resaved-after-archive-id',
        alreadySaved: false,
        confidence: 0.9,
      });

      // A genuine new save — not the already-saved/race-recovery shape.
      expect(tableBuilder.insert).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledWith('resaved-after-archive-id');
    });
  });

  // -------------------------------------------------------------------------
  // onSaved fire-and-forget safety
  // -------------------------------------------------------------------------

  describe('onSaved hook', () => {
    it('does not throw when onSaved hook throws synchronously', async () => {
      const onSaved = vi.fn().mockImplementation(() => {
        throw new Error('hook exploded');
      });
      const deps = makeDeps({ onSaved });

      // addListing should still resolve successfully
      await expect(addListing(INPUT_URL, deps)).resolves.toMatchObject({
        listingId: 'new-listing-id',
        alreadySaved: false,
      });
    });

    it('does not await onSaved (async throwing hook does not break addListing)', async () => {
      const onSaved = vi.fn().mockReturnValue(
        Promise.reject(new Error('async hook failed')),
      );
      const deps = makeDeps({ onSaved });

      // Should resolve without propagating the async rejection
      await expect(addListing(INPUT_URL, deps)).resolves.toMatchObject({
        alreadySaved: false,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Row mapping details
  // -------------------------------------------------------------------------

  describe('row mapping', () => {
    it('maps source_site from first dotted label of source_domain', async () => {
      const deps = makeDeps(); // highConfidenceListing.source_domain = 'zillow.com'

      await addListing(INPUT_URL, deps);

      const row = deps.tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
      expect(row['source_site']).toBe('zillow');
    });

    it('sets source_site to null when source_domain is empty', async () => {
      const tableBuilder = buildTableBuilder();
      const deps = makeDeps({
        extractedListing: { ...highConfidenceListing, source_domain: '' },
        tableBuilder,
      });

      await addListing(INPUT_URL, deps);

      const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
      expect(row['source_site']).toBeNull();
    });

    it('maps low-confidence listing with minimal fields without crashing', async () => {
      const tableBuilder = buildTableBuilder(null, 'low-conf-id');
      const deps = makeDeps({
        extractedListing: lowConfidenceOgOnly,
        tableBuilder,
      });

      const result = await addListing(INPUT_URL, deps);

      expect(result.listingId).toBe('low-conf-id');
      expect(result.confidence).toBe(0.3);

      const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
      expect(row['bedrooms']).toBeNull();
      expect(row['bathrooms']).toBeNull();
      expect(row['sqft']).toBeNull();
      expect(row['address']).toBeNull();
      expect(row['description']).toBeNull();
      expect(Array.isArray(row['amenities'])).toBe(true);
      expect(Array.isArray(row['photo_urls'])).toBe(true);
    });

    it('stores raw_og in raw_extraction when extraction has OG data', async () => {
      const tableBuilder = buildTableBuilder(null, 'og-id');
      const deps = makeDeps({
        extractedListing: lowConfidenceOgOnly, // has raw_og
        tableBuilder,
      });

      await addListing(INPUT_URL, deps);

      const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
      const rawExtraction = row['raw_extraction'] as Record<string, unknown>;
      expect(rawExtraction['raw_og']).toEqual(lowConfidenceOgOnly.raw_og);
      expect(rawExtraction['extraction_method']).toBe('og');
    });

    // -----------------------------------------------------------------------
    // AIN-83 Task 3: ingest-time floor-plan seed. When save-time extraction
    // returns floor_plans (a Zillow building-page save), the UI has plans
    // instantly — no ~10s crm_deep_extract mission wait, and worker-down
    // doesn't blank the feature. ONE canonical shape (raw_extraction.deep_extract),
    // the mission later overwrites it with its richer version (method: 'mission_v1').
    // -----------------------------------------------------------------------
    describe('floor-plan seed (AIN-83)', () => {
      const FLOOR_PLANS = [
        { name: 'A11', bedrooms: 1, bathrooms: 1, rent_min: 1819, rent_max: 2118, sqft: 799 },
        { name: 'S1', bedrooms: 0, bathrooms: 1, rent_min: 1825, rent_max: 1825, sqft: 547 },
      ];

      it('writes raw_extraction.deep_extract when floor_plans are present', async () => {
        const tableBuilder = buildTableBuilder(null, 'building-id');
        const deps = makeDeps({
          extractedListing: { ...highConfidenceListing, floor_plans: FLOOR_PLANS },
          tableBuilder,
        });

        await addListing(INPUT_URL, deps);

        const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
        const rawExtraction = row['raw_extraction'] as Record<string, unknown>;
        const deepExtract = rawExtraction['deep_extract'] as Record<string, unknown>;
        expect(deepExtract).toBeDefined();
        expect(deepExtract['floor_plans']).toEqual(FLOOR_PLANS);
        expect(deepExtract['price_is_from']).toBe(true);
        expect(deepExtract['method']).toBe('ingest_v1');
      });

      it('does NOT add a deep_extract key when floor_plans are absent (existing behavior pinned)', async () => {
        const tableBuilder = buildTableBuilder(null, 'no-plans-id');
        const deps = makeDeps({
          extractedListing: highConfidenceListing, // no floor_plans field
          tableBuilder,
        });

        await addListing(INPUT_URL, deps);

        const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
        const rawExtraction = row['raw_extraction'] as Record<string, unknown>;
        expect(rawExtraction).not.toHaveProperty('deep_extract');
        // raw_extraction keeps exactly its pre-AIN-83 shape.
        expect(Object.keys(rawExtraction).sort()).toEqual(
          ['extraction_method', 'raw_json_ld', 'raw_og'].sort(),
        );
      });

      it('does NOT add a deep_extract key when floor_plans is an empty array', async () => {
        const tableBuilder = buildTableBuilder(null, 'empty-plans-id');
        const deps = makeDeps({
          extractedListing: { ...highConfidenceListing, floor_plans: [] },
          tableBuilder,
        });

        await addListing(INPUT_URL, deps);

        const row = tableBuilder.insert.mock.calls[0]![0] as Record<string, unknown>;
        const rawExtraction = row['raw_extraction'] as Record<string, unknown>;
        expect(rawExtraction).not.toHaveProperty('deep_extract');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Background nickname generation (AIN-95)
  // -------------------------------------------------------------------------

  describe('background nickname scheduling (AIN-95)', () => {
    it('schedules a nickname-generation task on a NEW save via deps.scheduleBackground', async () => {
      const scheduleBackground = vi.fn();
      const deps = makeDeps({ scheduleBackground });

      const result = await addListing(INPUT_URL, deps);

      expect(scheduleBackground).toHaveBeenCalledTimes(1);
      const task = scheduleBackground.mock.calls[0]![0] as () => Promise<void>;
      expect(typeof task).toBe('function');

      // Running the scheduled task calls generateListingNickname with the
      // inserted listingId + userId.
      await task();
      expect(generateListingNickname).toHaveBeenCalledTimes(1);
      expect(generateListingNickname).toHaveBeenCalledWith(
        { listingId: result.listingId, userId: deps.userId },
        expect.objectContaining({ db: deps.db }),
      );
    });

    it('does NOT schedule nickname generation on the alreadySaved (dedup) path', async () => {
      const scheduleBackground = vi.fn();
      const existingRow = { id: 'existing-id', extraction_confidence: 0.7 };
      const tableBuilder = buildTableBuilder(existingRow);
      const deps = makeDeps({ tableBuilder, scheduleBackground });

      const result = await addListing(INPUT_URL, deps);

      expect(result.alreadySaved).toBe(true);
      expect(scheduleBackground).not.toHaveBeenCalled();
      expect(generateListingNickname).not.toHaveBeenCalled();
    });

    it('falls back to a fire-and-forget default scheduler when scheduleBackground is omitted, swallowing a rejection', async () => {
      vi.mocked(generateListingNickname).mockRejectedValueOnce(new Error('generation blew up'));
      const deps = makeDeps(); // no scheduleBackground

      // Should resolve normally — the default scheduler must not propagate
      // the background task's rejection, nor delay addListing's own return.
      await expect(addListing(INPUT_URL, deps)).resolves.toMatchObject({
        alreadySaved: false,
      });

      // Let the fire-and-forget microtask/catch settle before asserting —
      // this also proves no unhandled rejection escapes the test.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(generateListingNickname).toHaveBeenCalledTimes(1);
    });

    // CodeRabbit finding (PR #119): a synchronously-throwing scheduler (e.g.
    // Next's after() invoked outside a request scope) must not abort
    // addListing after the row has already been persisted — Step 6 must be
    // guarded exactly like the onSaved hook above it.
    it('resolves with the normal success result when scheduleBackground throws synchronously', async () => {
      const scheduleBackground = vi.fn().mockImplementation(() => {
        throw new Error('scheduler exploded (e.g. after() outside request scope)');
      });
      const deps = makeDeps({ scheduleBackground });

      await expect(addListing(INPUT_URL, deps)).resolves.toMatchObject({
        listingId: 'new-listing-id',
        alreadySaved: false,
      });

      expect(scheduleBackground).toHaveBeenCalledTimes(1);
    });
  });
});
