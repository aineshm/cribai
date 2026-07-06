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
    raw_extraction: {
      raw_json_ld: extracted.raw_json_ld ?? null,
      raw_og: extracted.raw_og ?? null,
      extraction_method: extracted.extraction_method,
    },
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
  // Step 2: Dedup — query for a non-archived row with the same user_id + url
  //
  // FIX 4: The migration 037 index on (user_id, source_url) is NON-UNIQUE, so a
  // declined + active row can both exist for the same URL (PGRST116 from .maybeSingle()
  // would hard-fail). Adding .order('saved_at', {ascending:false}).limit(1) ensures
  // we always return at most one row (the most-recent non-archived one) without error.
  // -------------------------------------------------------------------------
  const dedupResult = await deps.db
    .from('crm_listings')
    .select('id, extraction_confidence')
    .eq('user_id', deps.userId)
    .eq('source_url', url)
    .neq('status', 'archived')
    .order('saved_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dedupResult.error) {
    throw new AddListingError(
      'db_error',
      "I couldn't save that listing. Please try again.",
      dedupResult.error,
    );
  }

  if (dedupResult.data) {
    const existing = dedupResult.data as { id: string; extraction_confidence: number | null };
    return {
      listingId: existing.id,
      alreadySaved: true,
      confidence:
        existing.extraction_confidence ??
        confidenceToNumeric(extracted.extraction_confidence),
    };
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
  const row = mapToInsertRow(url, deps.userId, extracted, coordinates);

  const insertResult = await deps.db
    .from('crm_listings')
    .insert(row)
    .select('id')
    .single();

  if (insertResult.error) {
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
  };
}
