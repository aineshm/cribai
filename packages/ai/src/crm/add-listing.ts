/**
 * addListing — CRM workflow entry point (AIN-15, Track C Phase 1).
 *
 * Orchestrates three sequential steps:
 *   1. Extract listing data from the URL via the injected extraction service.
 *   2. Dedup against crm_listings (same user_id + source_url, status != 'archived').
 *   3. Insert a new row and fire the post-save hooks (fire-and-forget): the
 *      caller's `onSaved` and background nickname generation (AIN-95).
 *
 * This module does NOT call Gemini or run any analysis itself — the
 * `firstSaveAnalysis` fanout is deferred to `deps.onSaved` (Task 5), and
 * nickname generation is deferred to `generateListingNickname` (AIN-95, its
 * own silent-failure module) scheduled via `deps.scheduleBackground`. Both
 * hooks fire on NEW saves ONLY — never on the `alreadySaved` dedup path.
 *
 * Import graph:
 *   ./types  ← AddListingDeps, AddListingResult, AddListingErrorCode,
 *              ExtractedListing, ExtractionErrorCode
 *   ./confidence  ← confidenceToNumeric
 *   ../extraction  ← ExtractionError (for instanceof check in catch)
 *   ./nickname  ← generateListingNickname (background hook, AIN-95, Task 3)
 */

import { randomUUID } from 'node:crypto';
import { ExtractionError } from '../extraction';
import { confidenceToNumeric } from './confidence';
import { generateListingNickname } from './nickname';
import { normalizeSourceUrl } from './source-url';
import {
  SelectedUnitSchema,
  type RawSelectedUnit,
  type SelectedUnit,
} from '../extraction/selected-unit';
import type {
  AddListingDeps,
  AddListingResult,
  AddListingErrorCode,
  ExtractedListing,
} from './types';

// ---------------------------------------------------------------------------
// AddListingError
// ---------------------------------------------------------------------------

/**
 * Typed error thrown by `addListing`. Always carries a `code` and a
 * `userMessage` suitable for display in the chat UI.
 *
 * The `code` is either an `ExtractionErrorCode` or `'db_error'`. Callers
 * should branch on `code`, not parse `message`.
 */
export class AddListingError extends Error {
  readonly code: AddListingErrorCode;
  readonly userMessage: string;
  override readonly cause?: unknown;

  constructor(code: AddListingErrorCode, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = 'AddListingError';
    this.code = code;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map an extraction error code to the user-facing message shown in chat.
 * Keeping this as a pure lookup makes testing the mapping independent of I/O.
 */
const EXTRACTION_USER_MESSAGES: Readonly<Record<string, string>> = {
  fetch_blocked: 'That site is blocking automated reads. Try pasting the listing details directly.',
  fetch_failed: "I couldn't reach that page. Check the URL and try again.",
  parse_failed: "That doesn't look like a valid listing URL.",
  no_listing_data: "I fetched the page but couldn't find listing details on it.",
};

/**
 * Derive a short site label from a source_domain string.
 *
 * Strategy: take the first dotted label — `'zillow.com'` → `'zillow'`,
 * `'apartments.com'` → `'apartments'`. Returns null when source_domain is
 * empty or absent (graceful degradation; the crm_listings column is nullable).
 */
function deriveSiteName(sourceDomain: string | undefined): string | null {
  if (!sourceDomain) return null;
  const firstLabel = sourceDomain.split('.')[0];
  return firstLabel || null;
}

/**
 * Build the coordinates WKT string from lat/lng.
 * Longitude comes FIRST per the PostGIS POINT(lng lat) convention.
 */
function makeCoordinatesWkt(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

/**
 * Map an ExtractedListing to the crm_listings insert row.
 * Returns a new object — never mutates the input.
 *
 * `coordinates` is omitted when no coords are available; the caller spreads
 * the result of this function and conditionally appends `coordinates`.
 */
/**
 * Build the `raw_extraction` insert value. Bare shape (pre-AIN-83) when the
 * extraction carries no floor plans — an empty array counts as "none" so a
 * building page whose deterministic parse found nothing degrades exactly
 * like a single-unit save. When plans ARE present, seed
 * `raw_extraction.deep_extract` (AIN-83 decision 5) so the UI has a
 * per-plan breakdown instantly, without waiting on the ~10s crm_deep_extract
 * mission — and so the feature survives the mission worker being down.
 * `method: 'ingest_v1'` distinguishes this seed from the mission's own
 * `'mission_v1'` write (`04-update-row.ts`), which later overwrites it with
 * a richer version (crawled pages, discarded URLs) while preserving
 * whichever floor_plans value is non-empty (never-wipe guard, Task 4).
 */
/**
 * Stamp `viewed_at` onto a raw unit projection and validate it against
 * `SelectedUnitSchema`. Returns `null` when `raw` is absent or fails
 * validation (never throws) — a malformed unit degrades to "nothing to
 * seed/append", exactly like a malformed floor plan degrades to "drop this
 * one entry" elsewhere in the extraction layer.
 */
function buildSelectedUnitEntry(raw: RawSelectedUnit | undefined): SelectedUnit | null {
  if (!raw) return null;
  const candidate = { ...raw, viewed_at: new Date().toISOString() };
  const parsed = SelectedUnitSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function buildRawExtraction(extracted: ExtractedListing): Record<string, unknown> {
  const base: Record<string, unknown> = {
    raw_json_ld: extracted.raw_json_ld ?? null,
    raw_og: extracted.raw_og ?? null,
    extraction_method: extracted.extraction_method,
  };

  const hasFloorPlans = Boolean(extracted.floor_plans && extracted.floor_plans.length > 0);
  const selectedUnitEntry = buildSelectedUnitEntry(extracted.selected_unit);

  if (hasFloorPlans || selectedUnitEntry) {
    base['deep_extract'] = {
      ...(hasFloorPlans ? { floor_plans: extracted.floor_plans, price_is_from: true } : {}),
      ...(selectedUnitEntry ? { units_of_interest: [selectedUnitEntry] } : {}),
      method: 'ingest_v1',
    };
  }

  return base;
}

/**
 * Accumulate a newly-viewed unit onto an EXISTING row's
 * `raw_extraction.deep_extract.units_of_interest` (AIN-98) — the dedup path
 * (both the fast SELECT hit and the 23505 race-recovery hit) never inserts a
 * new row, so the only way to record "the user also looked at unit X on
 * this building" is a write against the row that already exists.
 *
 * Delegates the dedupe/append/cap entirely to the `crm_append_unit_of_interest`
 * Postgres function (migration 047) via a single atomic UPDATE, rather than
 * a JS-side read-merge-write (SELECT the array, mutate in JS, UPDATE the
 * whole object) — the old approach had a lost-update race window between
 * the SELECT and the UPDATE where a concurrent writer (a second rapid
 * re-save, or the crm_deep_extract mission's `04-update-row.ts`) could drop
 * the other's appended unit (Review fix, HIGH, AIN-98 adjudication). The SQL
 * function's own comment documents why a single self-referencing UPDATE is
 * race-free.
 *
 * Never fails the save: any RPC error (thrown or resolved) is swallowed —
 * enrichment is a nice-to-have, not part of the save contract.
 */
async function enrichExistingListingWithUnit(
  deps: AddListingDeps,
  listingId: string,
  rawUnit: RawSelectedUnit | undefined,
): Promise<void> {
  const nextEntry = buildSelectedUnitEntry(rawUnit);
  if (!nextEntry) return;

  try {
    await deps.db.rpc('crm_append_unit_of_interest', {
      p_listing_id: listingId,
      p_unit: nextEntry,
    });
  } catch {
    // Enrichment failure must never fail the save.
  }
}

/**
 * Run the dedup SELECT: the most-recent non-archived row for this user_id +
 * source_url, if any. Shared by Step 2's fast-path dedup and the AIN-98
 * 23505 race-recovery lookup in Step 4 — a concurrent insert can beat us
 * past Step 2's check, so the unique-violation error means a re-run of this
 * identical query to find the row that won the race.
 *
 * FIX 4 (still applies here): .order('saved_at', {ascending:false}).limit(1)
 * ensures at most one row comes back even if a declined + active row somehow
 * coexist, so .maybeSingle() never hard-fails with PGRST116.
 */
async function selectExistingListing(
  deps: AddListingDeps,
  url: string,
): Promise<{
  data: { id: string; extraction_confidence: number | null } | null;
  error: unknown;
}> {
  const result = await deps.db
    .from('crm_listings')
    .select('id, extraction_confidence')
    .eq('user_id', deps.userId)
    .eq('source_url', url)
    .neq('status', 'archived')
    .order('saved_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    data: result.data as { id: string; extraction_confidence: number | null } | null,
    error: result.error,
  };
}

/** Map an existing row to the "already saved" result shape (dedup + race-recovery). */
function toAlreadySavedResult(
  existing: { id: string; extraction_confidence: number | null },
  extracted: ExtractedListing,
  normalizedUrl: string,
): AddListingResult {
  return {
    listingId: existing.id,
    alreadySaved: true,
    confidence:
      existing.extraction_confidence ?? confidenceToNumeric(extracted.extraction_confidence),
    normalizedUrl,
  };
}

function mapToInsertRow(
  url: string,
  userId: string,
  extracted: ExtractedListing,
  coordinates: string | undefined,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    user_id: userId,
    source_url: url,
    source_site: deriveSiteName(extracted.source_domain),
    title: extracted.title ?? null,
    address: extracted.address ?? null,
    description: extracted.description ?? null,
    rent: extracted.price ?? null,
    bedrooms: extracted.bedrooms ?? null,
    bathrooms: extracted.bathrooms ?? null,
    sqft: extracted.square_feet ?? null,
    available_from: extracted.available_from ?? null,
    amenities: extracted.amenities ?? [],
    photo_urls: extracted.photos ?? [],
    extraction_confidence: confidenceToNumeric(extracted.extraction_confidence),
    raw_extraction: buildRawExtraction(extracted),
  };

  // Conditionally add coordinates — omitting the key entirely when absent.
  if (coordinates !== undefined) {
    base['coordinates'] = coordinates;
  }

  return base;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save a listing URL to the user's CRM.
 *
 * Workflow:
 *   1. Call `deps.extract(url)` to fetch + parse the listing page.
 *   2. Dedup: if a non-archived row with the same user_id + source_url already
 *      exists, return it immediately without inserting.
 *   3. Resolve coordinates: use extracted lat/lng if present; else geocode
 *      via `deps.geocode` when an API key and the dep are provided; else omit.
 *   4. Insert the new row.
 *   5. Call `deps.onSaved(listingId)` fire-and-forget (Task 5 hook).
 *
 * @throws {AddListingError} with a user-friendly message on any failure.
 */
export async function addListing(
  url: string,
  deps: AddListingDeps,
): Promise<AddListingResult> {
  // -------------------------------------------------------------------------
  // Step 0: Eval dry-run gate (mirrors create-sublease / schedule-tour).
  //
  // The eval runner drives the real registry with `dryRun: true` + a
  // service-role client specifically so a model-driven save can NEVER land a
  // real `crm_listings` row. We short-circuit BEFORE the extract network fetch
  // AND the `.insert`, returning a synthetic-success result of the SAME shape
  // the real new-save path returns (a valid UUID listingId — required because
  // the chained `first_save_analysis` tool's registry inputSchema is
  // `z.string().uuid()` — `alreadySaved: false`, mid confidence). Live traffic
  // is always `dryRun=false` (default), so the prod path below is unchanged.
  // -------------------------------------------------------------------------
  if (deps.dryRun) {
    return {
      listingId: randomUUID(),
      alreadySaved: false,
      confidence: 0.5,
    };
  }

  // -------------------------------------------------------------------------
  // Step 1: Extract
  // -------------------------------------------------------------------------
  let extracted: ExtractedListing;
  try {
    extracted = await deps.extract(url);
  } catch (err: unknown) {
    // Read the code defensively — may be an ExtractionError or an unknown throw.
    let code: AddListingErrorCode = 'fetch_failed';
    if (err instanceof ExtractionError) {
      code = err.code;
    } else if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      typeof (err as Record<string, unknown>)['code'] === 'string'
    ) {
      const raw = (err as Record<string, unknown>)['code'] as string;
      if (raw in EXTRACTION_USER_MESSAGES) {
        code = raw as AddListingErrorCode;
      }
    }
    const userMessage = EXTRACTION_USER_MESSAGES[code] ?? EXTRACTION_USER_MESSAGES['fetch_failed']!;
    throw new AddListingError(code, userMessage, err);
  }

  // -------------------------------------------------------------------------
  // AIN-98: normalize the URL BEFORE any dedup/insert use. `url` (the raw,
  // possibly fragment-bearing input) was already handed to `deps.extract`
  // above — extraction reads the fragment for unit resolution before it's
  // gone. Every DB use below (dedup SELECT, INSERT, race recovery) uses
  // `normalizedUrl` so fragment/tracking-param/trailing-slash variants of
  // the same listing collapse onto one (user_id, source_url) identity.
  // -------------------------------------------------------------------------
  const normalizedUrl = normalizeSourceUrl(url);

  // -------------------------------------------------------------------------
  // Step 2: Dedup — query for a non-archived row with the same user_id + url
  // -------------------------------------------------------------------------
  const dedupResult = await selectExistingListing(deps, normalizedUrl);

  if (dedupResult.error) {
    throw new AddListingError(
      'db_error',
      "I couldn't save that listing. Please try again.",
      dedupResult.error,
    );
  }

  if (dedupResult.data) {
    // AIN-98: accumulate the newly-viewed unit (if any) onto the EXISTING
    // row before returning — read-merge-write, never fails the save.
    await enrichExistingListingWithUnit(deps, dedupResult.data.id, extracted.selected_unit);
    return toAlreadySavedResult(dedupResult.data, extracted, normalizedUrl);
  }

  // -------------------------------------------------------------------------
  // Step 3: Resolve coordinates
  // -------------------------------------------------------------------------
  let coordinates: string | undefined;

  if (
    typeof extracted.latitude === 'number' &&
    typeof extracted.longitude === 'number'
  ) {
    // (a) Coords from extraction
    coordinates = makeCoordinatesWkt(extracted.latitude, extracted.longitude);
  } else if (
    extracted.address &&
    deps.placesApiKey &&
    deps.geocode
  ) {
    // (b) Geocode via injected dep
    const geocoded = await deps.geocode(extracted.address, deps.placesApiKey);
    if (geocoded && geocoded.latitude != null && geocoded.longitude != null) {
      coordinates = makeCoordinatesWkt(geocoded.latitude, geocoded.longitude);
    }
  }
  // (c) else: no coords — omit the key

  // -------------------------------------------------------------------------
  // Step 4: Insert
  // -------------------------------------------------------------------------
  const row = mapToInsertRow(normalizedUrl, deps.userId, extracted, coordinates);

  const insertResult = await deps.db
    .from('crm_listings')
    .insert(row)
    .select('id')
    .single();

  if (insertResult.error) {
    // AIN-98: migration 046 adds a unique (user_id, source_url) index, so a
    // concurrent double-save that both passed Step 2's SELECT dedup now
    // fails one of the two INSERTs with 23505 instead of landing a duplicate
    // row. Treat that race exactly like the Step 2 dedup path — re-run the
    // same SELECT to find the row that won, and return it as already saved.
    // Never silently swallow: if the recovery lookup itself errors or turns
    // up nothing, fall through to the generic db_error below.
    const errorCode = (insertResult.error as { code?: string } | null)?.code;
    if (errorCode === '23505') {
      const raceResult = await selectExistingListing(deps, normalizedUrl);
      if (!raceResult.error && raceResult.data) {
        // AIN-98: same accumulation as the fast-dedup path above — the row
        // that won the race is the "existing" row from this call's point of
        // view.
        await enrichExistingListingWithUnit(deps, raceResult.data.id, extracted.selected_unit);
        return toAlreadySavedResult(raceResult.data, extracted, normalizedUrl);
      }
    }

    throw new AddListingError(
      'db_error',
      "I couldn't save that listing. Please try again.",
      insertResult.error,
    );
  }

  const listingId = (insertResult.data as { id: string }).id;

  // -------------------------------------------------------------------------
  // Step 5: Fire-and-forget post-save hook
  // -------------------------------------------------------------------------
  if (deps.onSaved) {
    try {
      const maybePromise = deps.onSaved(listingId);
      // Handle async hooks without awaiting them.
      if (
        maybePromise !== null &&
        typeof maybePromise === 'object' &&
        typeof (maybePromise as Promise<unknown>).catch === 'function'
      ) {
        (maybePromise as Promise<unknown>).catch(() => {
          // Suppress unhandled-rejection noise — fire-and-forget.
        });
      }
    } catch {
      // Sync throw from the hook must not break addListing.
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: Schedule background nickname generation (AIN-95, NEW saves only).
  //
  // This runs unconditionally for every new-save caller (extension ingest,
  // chat add_listing tool, REST POST) since it lives inside the shared core,
  // not any one route. `deps.scheduleBackground` lets request-bound callers
  // hand the task to Next's `after()` so the lambda survives long enough for
  // the background LLM call; the default below just fires it and swallows
  // any rejection — a nickname failure must never surface as an addListing
  // error (mirrors the onSaved fire-and-forget contract above).
  // -------------------------------------------------------------------------
  const scheduleBackground =
    deps.scheduleBackground ??
    ((task: () => Promise<void>) => {
      void task().catch(() => {
        // Suppress unhandled-rejection noise — fire-and-forget default.
      });
    });

  try {
    scheduleBackground(() =>
      generateListingNickname({ listingId, userId: deps.userId }, { db: deps.db }),
    );
  } catch {
    // Sync throw from the scheduler must not break addListing.
  }

  return {
    listingId,
    alreadySaved: false,
    confidence: confidenceToNumeric(extracted.extraction_confidence),
    normalizedUrl,
  };
}
