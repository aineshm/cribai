/**
 * POST /api/crm/ingest (AIN-62 — WS3b Chrome Extension HTML-as-input save path)
 *
 * The Chrome extension captures `document.documentElement.outerHTML` from the
 * user's real browser session and POSTs it here. This route:
 *   1. Authenticates via Bearer token (extension cannot use cookies).
 *   2. Validates the request body: sourceUrl (http(s) only, trimmed),
 *      html (non-empty, ≤ 4 MiB), capturedAt (ISO-8601 datetime with offset).
 *   3. Enforces three hard-gate security controls (AIN-62 spec):
 *      a. Per-user ingest rate limit (5 calls / hr — see ingest-rate-limiter.ts).
 *      b. Per-user 200-row save cap (same guard as POST /api/crm/listings).
 *      c. Per-request wall-clock budget (INGEST_BUDGET_MS env var, default 30s).
 *   4. Calls addListing with extractListingFromHtml as the extract dep — the
 *      HTML is treated as data and NEVER fetched again (no outbound request to
 *      sourceUrl). The extraction pipeline's LLM rare-path runs only when the
 *      structured passes (JSON-LD, OG, DOM) don't produce the key fields.
 *   5. Fires firstSaveAnalysis write-through for new saves (fire-and-forget,
 *      same pattern as GET /api/crm/listings/[id]/analysis).
 *   6. Responds with the AddListingResult + a short summary string for the
 *      extension popup. 201 for a new save, 200 for an already-saved URL.
 *      201 responses include `analysisPending: true` so the popup can signal
 *      that analysis is computing asynchronously.
 *
 * CORS: OPTIONS preflight is answered for the single configured extension
 * origin (CRM_EXTENSION_ORIGIN env var). Unknown or missing origins are denied.
 *
 * NO-FETCH CONTRACT: this route NEVER calls fetch(sourceUrl). The validation
 * replaces the fetch-side SSRF guard: we reject non-http(s) schemes and treat
 * the HTML as data only. Public-host / DNS checks are omitted because there
 * is no outbound request to guard against.
 *
 * LLM-ESCALATION COST CAP: worst case is up to 2 LLM calls per ingest —
 * extraction rare-path (Gemini) and the redFlags branch of firstSaveAnalysis
 * (OpenAI, default maxRetries noted). At 5 ingest saves/hr that is up to
 * 10 LLM calls per user per hour across both providers — matching, not
 * beating, the 10/hr chat class limit. No separate counter is needed; the
 * rate limit IS the cost cap.
 *
 * MULTI-INSTANCE CAVEAT: the in-memory rate limiter is per-lambda-instance;
 * a determined attacker could exceed the per-user quota by hitting multiple
 * cold-start Vercel instances. This is an accepted risk at current scale.
 * A DB-backed upgrade is tracked in Linear: "DB-backed ingest rate limiter
 * before growth ramp".
 *
 * PLATFORM ASSUMPTION: Vercel rejects request bodies > 4.5 MB at the
 * infrastructure layer. Self-hosted deploys rely on the content-length
 * precheck below as their first line of defence before any body buffering.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import {
  addListing,
  AddListingError,
  extractListingFromHtml,
  geocodeAddress,
  firstSaveAnalysis,
  type AddListingErrorCode,
} from '@campusnest/ai';
import { createSecretClient } from '@campusnest/supabase/server';
import { uploadCapture } from '@campusnest/supabase/storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCrmAuthFromBearer, type CrmAuth } from '../_lib/auth';
import { sourceUrlSchema } from '../_lib/source-url-schema';
import { buildExtensionCorsHeaders as buildCorsHeaders } from '../_lib/extension-cors';
import {
  checkIngestRateLimit,
  recordIngestRequest,
} from '../_lib/ingest-rate-limiter';
import { MAX_SAVED_LISTINGS } from '../listings/route';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Hard cap on HTML size at this route boundary. Mirrors MAX_SEAM_HTML_BYTES
 * in the extraction seam (4 MiB) — checked here so the route responds with a
 * typed 413 before handing off to the pipeline.
 */
const MAX_HTML_BYTES = 4 * 1024 * 1024;

/**
 * Content-length precheck limit (~4.5 MiB): the JSON envelope adds up to
 * ~512 KiB of overhead above the 4 MiB html cap. Any Content-Length header
 * reporting >= this value is rejected immediately, before the body is buffered.
 *
 * Platform assumption: Vercel rejects bodies > 4.5 MB at the infrastructure
 * layer. Self-hosted deploys rely on this precheck. The byte-accurate
 * Buffer.byteLength check below remains as the second layer.
 */
const MAX_CONTENT_LENGTH_BYTES = MAX_HTML_BYTES + 512 * 1024; // 4.5 MiB

/**
 * Wall-clock budget for the entire request (extraction + addListing + analysis
 * fire). Overridable via INGEST_BUDGET_MS env var for tests. Default 30 s is
 * generous for a local extension call but tight enough to prevent hanging.
 */
const DEFAULT_BUDGET_MS = 30_000;

// ── Zod schema ────────────────────────────────────────────────────────────────

const ingestBodySchema = z.object({
  // sourceUrlSchema: trim + 1–2048 chars + http(s)-only. Shared with
  // GET /api/crm/saved so dedup comparisons can never drift (Fix 5, AIN-72).
  sourceUrl: sourceUrlSchema,
  html: z
    .string()
    .min(1, { message: 'html must be a non-empty string' })
    .refine((v) => v.trim().length > 0, { message: 'html must be a non-empty string' }),
  /**
   * ISO-8601 datetime string with timezone offset.
   * Reserved for future audit logging — intentionally not yet persisted.
   * Using z.string().datetime({ offset: true }) for strict schema validation.
   */
  capturedAt: z.string().datetime({ offset: true }),
  /** Richer capture fields (AIN-71) — optional, used by the extraction pipeline. */
  innerText: z.string().max(200_000).optional(),
  iframes: z.array(z.object({
    src: z.string().max(2048),
    html: z.string().max(524_288),
  })).max(10).optional(),
});

// ── Error status map ──────────────────────────────────────────────────────────

/** HTTP status for each AddListingError code (extraction upstream vs our fault). */
const ADD_LISTING_ERROR_STATUS: Readonly<Record<AddListingErrorCode, number>> = {
  fetch_blocked: 502,
  fetch_failed: 502,
  parse_failed: 422,
  no_listing_data: 422,
  db_error: 500,
};

/**
 * Error codes that should surface the user message from AddListingError
 * directly to the client. db_error is excluded — it may contain raw DB details.
 */
const SAFE_USER_MESSAGE_CODES = new Set<AddListingErrorCode>([
  'parse_failed',
  'no_listing_data',
  'fetch_blocked',
  'fetch_failed',
]);

// ── CORS helpers ──────────────────────────────────────────────────────────────
// Shared with /api/auth/validate-email (the extension's other cross-origin
// call) — implementation in `../_lib/extension-cors.ts`.

// ── Budget wrapper ────────────────────────────────────────────────────────────

/**
 * Wrap a promise with a wall-clock timeout. Resolves with the value or rejects
 * with a typed `BudgetExceededError` when the deadline fires first.
 *
 * NOTE: the losing addListing call may continue running after a 504 response.
 * If it completes successfully and inserts the row, the user's retry will see
 * `alreadySaved: true` — dedup ensures the retry converges to the correct state.
 * This is accepted behaviour: the alternative (aborting the insert) would
 * require AbortController propagation through addListing, and the dedup guard
 * already makes the outcome safe.
 */
class BudgetExceededError extends Error {
  constructor() {
    super('Request processing budget exceeded');
    this.name = 'BudgetExceededError';
  }
}

function withBudget<T>(promise: Promise<T>, budgetMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new BudgetExceededError()), budgetMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ── Analysis write-through (fire-and-forget) ──────────────────────────────────

/**
 * Identical pattern to GET /api/crm/listings/[id]/analysis: run firstSaveAnalysis,
 * persist when no branch errored, swallow any failure (analysis is best-effort
 * at ingest time; the user can always re-fetch from the dashboard).
 */
async function fireAnalysis(auth: CrmAuth, listingId: string): Promise<void> {
  try {
    const analysis = await firstSaveAnalysis(listingId, {
      db: auth.db,
      userId: auth.userId,
      placesApiKey: process.env['GOOGLE_PLACES_API_KEY'],
    });

    const hasError = [
      analysis.trueCost,
      analysis.redFlags,
      analysis.placesSnapshot,
      analysis.steeringQuestion,
    ].some((branch) => branch.status === 'error');

    if (!hasError) {
      const { error } = await auth.db
        .from('crm_listings')
        .update({ analysis, analyzed_at: new Date().toISOString() })
        .eq('id', listingId)
        .eq('user_id', auth.userId);

      if (error) {
        console.error('[crm/ingest] Analysis write-through failed:', error.message);
      }
    }
  } catch (err: unknown) {
    console.error('[crm/ingest] firstSaveAnalysis error (swallowed):', err instanceof Error ? err.message : String(err));
  }
}

// ── Capture persistence (AIN-84, supersedes AIN-78) ──────────────────────────

/**
 * Best-effort persistence of the extension-captured HTML: gzipped object in
 * the private `listing-captures` bucket + a pointer row in
 * crm_listing_captures (`storage_path`, `captured_at`, `consumed_at`).
 *
 * Called when a deep-extract mission is about to be enqueued so the
 * crawl_source step can reuse the user's real browser HTML instead of
 * re-fetching the URL server-side (anti-bot sites like Zillow block the
 * server-side fetch; the user's browser already loaded it cleanly).
 *
 * Design (AIN-84):
 *   - Storage upload runs on the SERVICE-ROLE client (`createSecretClient`):
 *     this route authenticates via `createBearerClient` (anon key + JWT),
 *     which cannot write to a policy-less private bucket. `userId` comes from
 *     validated auth and scopes the object path — same trust model as the
 *     service-role mission reads.
 *   - The pointer-row upsert stays on `auth.db` (RLS-scoped), exactly like
 *     the pre-AIN-84 row write.
 *   - Upload failure → SKIP the row write entirely (no dangling pointer),
 *     warn, and let the request 201 as before. The mission falls back to a
 *     server-side fetch.
 *   - Re-ingest overwrites the object (upsert), refreshes captured_at, and
 *     resets consumed_at to null — the freshest capture is unconsumed by
 *     definition and never treated as stale by the retention sweep (AIN-79
 *     is closed into AIN-84's sweep).
 *   - Never mutates its arguments; always creates a new row object.
 */
async function persistCapture(
  auth: CrmAuth,
  listingId: string,
  html: string,
): Promise<void> {
  try {
    const storageClient = createSecretClient() as unknown as SupabaseClient;
    const storagePath = await uploadCapture(storageClient, {
      userId: auth.userId,
      listingId,
      html,
    });

    const { error } = await auth.db
      .from('crm_listing_captures')
      .upsert(
        {
          listing_id: listingId,
          user_id: auth.userId,
          storage_path: storagePath,
          captured_at: new Date().toISOString(),
          consumed_at: null,
        },
        { onConflict: 'listing_id' },
      );
    if (error) {
      console.warn('[crm/ingest] capture pointer-row upsert failed (non-fatal):', error.message);
    }
  } catch (err) {
    // An uploadCapture throw lands here BEFORE the row write — an upload
    // failure therefore never leaves a dangling pointer row.
    console.warn(
      '[crm/ingest] capture persist failed (non-fatal):',
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ── Deep-extract mission enqueue (AIN-71) ────────────────────────────────────

/**
 * Confidence threshold below which we always queue a crm_deep_extract mission.
 * Above this threshold we still enqueue when key fields (sqft, amenities,
 * available_from, description) are missing — see checkNeedsEnrichment.
 */
const DEEP_EXTRACT_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Returns true when the listing needs deep enrichment:
 *   - confidence below threshold (always enqueue), OR
 *   - any key field (sqft, amenities, available_from, description) is missing
 *     on the just-inserted row (do a cheap projection SELECT).
 *
 * Does a cheap SELECT with a projection on the just-inserted row.
 * Never throws — on DB error defaults to false (don't enqueue).
 */
async function checkNeedsEnrichment(
  auth: CrmAuth,
  listingId: string,
  confidence: number,
): Promise<boolean> {
  if (confidence < DEEP_EXTRACT_CONFIDENCE_THRESHOLD) return true;

  try {
    const { data, error } = await auth.db
      .from('crm_listings')
      .select('sqft, amenities, available_from, description')
      .eq('id', listingId)
      .eq('user_id', auth.userId)
      .maybeSingle();

    if (error || !data) return false;

    const row = data as {
      sqft: number | null;
      amenities: string[] | null;
      available_from: string | null;
      description: string | null;
    };
    const amenitiesMissing = !row.amenities || (row.amenities as string[]).length === 0;
    return (
      row.sqft == null ||
      amenitiesMissing ||
      row.available_from == null ||
      row.description == null
    );
  } catch {
    return false;
  }
}

/**
 * Enqueue result discriminant:
 *   'inserted'      — genuine new insert (poke the worker)
 *   'already_queued' — unique-violation 23505 (mission already in queue; idempotent success)
 *   'failed'        — any other error (mission not enqueued)
 */
type EnqueueResult = 'inserted' | 'already_queued' | 'failed';

/**
 * Enqueue a crm_deep_extract mission for listings where the initial extraction
 * confidence is too low.
 *
 * Returns 'inserted' on a genuine new insert, 'already_queued' on a 23505
 * unique-violation (the mission is already in the queue — idempotent success),
 * or 'failed' for any other error. Never rejects — errors are swallowed so the
 * 201 response is never affected.
 *
 * NOTE: Migration 041 must be applied before this code is live. If it hasn't been
 * applied yet, the missions_type_check constraint will reject the insert with a
 * constraint violation (not 23505). We log and swallow that gracefully.
 */
async function enqueueDeepExtract(
  auth: CrmAuth,
  listingId: string,
  sourceUrl: string,
): Promise<EnqueueResult> {
  try {
    const { error } = await auth.db
      .from('missions')
      .insert({
        user_id: auth.userId,
        type: 'crm_deep_extract',
        title: 'Deep extraction scan',
        goal: 'Enrich low-confidence CRM listing by crawling source site',
        campus_id: null, // crm missions are not campus-scoped
        input: { listingId, sourceUrl },
        status: 'queued',
        listing_id: null,
        idempotency_key: `crm_deep_extract:${listingId}`,
      })
      .select('id')
      .single();

    if (error) {
      // 23505 = unique_violation on idempotency_key → mission already in queue
      if ((error as { code?: string }).code === '23505') {
        return 'already_queued';
      }
      // Other errors (e.g. migration 041 not yet applied) — log + continue
      console.warn('[crm/ingest] crm_deep_extract enqueue failed (swallowed):', error.message);
      return 'failed';
    }
    return 'inserted';
  } catch (err) {
    console.warn('[crm/ingest] crm_deep_extract enqueue threw (swallowed):', err instanceof Error ? err.message : String(err));
    return 'failed';
  }
}

/**
 * Best-effort POST to /api/missions/run-next to wake the mission worker immediately.
 *
 * The GitHub Actions cron nominally runs every 5 min but in practice fires every
 * ~3–4h due to GitHub throttling. Without this poke, every deep-extract mission
 * waits hours. Fire-and-forget — a rejected fetch is caught and discarded so it
 * never affects the caller's response.
 *
 * No-op when CRON_SECRET is not set (dev/preview without a worker).
 *
 * SECURITY: the base URL is NEVER derived from the request Host header or
 * request.url — a client-supplied Host could redirect the POST (carrying
 * CRON_SECRET) to an attacker host. Resolution order:
 *   1. MISSION_WORKER_BASE_URL (explicit override)
 *   2. VERCEL_PROJECT_PRODUCTION_URL (canonical prod URL on Vercel)
 *   3. VERCEL_URL (preview/branch deploy on Vercel)
 *   4. SKIP the poke entirely (GH cron remains the sweeper)
 */
function pokeMissionWorker(): void {
  const secret = process.env['CRON_SECRET'];
  if (!secret) return;

  const base =
    process.env['MISSION_WORKER_BASE_URL'] ??
    (process.env['VERCEL_PROJECT_PRODUCTION_URL']
      ? `https://${process.env['VERCEL_PROJECT_PRODUCTION_URL']}`
      : undefined) ??
    (process.env['VERCEL_URL']
      ? `https://${process.env['VERCEL_URL']}`
      : undefined);

  if (!base) return; // no resolvable base — GH cron is the sweeper

  const url = `${base}/api/missions/run-next`;
  void fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  }).catch(() => undefined);
}

// ── Build a short popup summary ───────────────────────────────────────────────

function buildSummary(listingId: string, alreadySaved: boolean): string {
  return alreadySaved
    ? 'This listing is already in your CRM.'
    : `Listing saved to your CRM (id: ${listingId}).`;
}

// ── Route handlers ────────────────────────────────────────────────────────────

/** OPTIONS — CORS preflight for the Chrome extension. */
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** POST /api/crm/ingest — HTML-as-input save from the Chrome extension. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);

  // ── 0. Content-length precheck (SEC HIGH) ────────────────────────────────
  // Reject oversized requests before buffering the body. This fires before
  // any auth or JSON parsing so we don't waste lambda memory on huge payloads.
  // Vercel enforces a 4.5 MB hard limit at the infra layer; this precheck is
  // the equivalent gate for self-hosted deployments.
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!isNaN(contentLength) && contentLength > MAX_CONTENT_LENGTH_BYTES) {
      return NextResponse.json(
        { error: `Request too large (${contentLength} bytes; max ${MAX_CONTENT_LENGTH_BYTES})` },
        { status: 413, headers: corsHeaders },
      );
    }
  }

  // ── 1. Auth — Bearer token only (no cookies) ─────────────────────────────
  const auth = await resolveCrmAuthFromBearer(request);
  if (!auth) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401, headers: corsHeaders },
    );
  }

  // ── 2. Rate limit (HARD GATE 1) ──────────────────────────────────────────
  // Check BEFORE body parse and extraction work — deny fast.
  const rateCheck = checkIngestRateLimit(auth.userId);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. Please wait before saving more listings.',
        retryAfterSeconds: Math.ceil(rateCheck.retryAfterMs / 1000),
      },
      { status: 429, headers: corsHeaders },
    );
  }

  // ── 3. Body validation ────────────────────────────────────────────────────
  // Read the body ONCE as text so we can check total size BEFORE JSON.parse.
  // This closes the gap where the Content-Length precheck can be skipped by
  // simply omitting the header — on self-hosted Node nothing else bounds body size.
  let rawText: string;
  let rawBody: unknown;
  try {
    rawText = await request.text();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders });
  }

  // FIX 8: total raw-body size check — fires BEFORE JSON.parse
  const rawBodyBytes = Buffer.byteLength(rawText, 'utf8');
  if (rawBodyBytes > MAX_CONTENT_LENGTH_BYTES) {
    return NextResponse.json(
      { error: `Request too large (${rawBodyBytes} bytes; max ${MAX_CONTENT_LENGTH_BYTES})` },
      { status: 413, headers: corsHeaders },
    );
  }

  try {
    rawBody = JSON.parse(rawText);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders });
  }

  const parsed = ingestBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders },
    );
  }

  const { sourceUrl, html, innerText, iframes } = parsed.data;

  // HTML size cap — byte-accurate check (multi-byte chars count).
  const htmlBytes = Buffer.byteLength(html, 'utf8');
  if (htmlBytes > MAX_HTML_BYTES) {
    return NextResponse.json(
      { error: `HTML payload too large (${htmlBytes} bytes; max ${MAX_HTML_BYTES})` },
      { status: 413, headers: corsHeaders },
    );
  }

  // ── 4. Row cap (HARD GATE 1b — matches listings route) ───────────────────
  const { count, error: countError } = await auth.db
    .from('crm_listings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.userId)
    .neq('status', 'archived');

  if (countError) {
    console.error('[crm/ingest] Cap check error:', countError);
    return NextResponse.json(
      { error: 'Failed to save listing' },
      { status: 500, headers: corsHeaders },
    );
  }

  if ((count ?? 0) >= MAX_SAVED_LISTINGS) {
    return NextResponse.json(
      {
        error: `You've reached the limit of ${MAX_SAVED_LISTINGS} saved listings. Archive some to make room.`,
      },
      { status: 429, headers: corsHeaders },
    );
  }

  // ── 5. Record rate-limit slot AFTER auth + validation pass ───────────────
  // Doing this after auth prevents unauthenticated callers from burning slots.
  recordIngestRequest(auth.userId);

  // ── 6. Extraction + save (HARD GATE 2: wall-clock budget) ────────────────
  const budgetMs = Number(process.env['INGEST_BUDGET_MS']) || DEFAULT_BUDGET_MS;

  try {
    // The extract closure captures (html, sourceUrl) from the validated request
    // and passes them to extractListingFromHtml — NO fetch of sourceUrl occurs.
    // The closure signature matches AddListingDeps.extract: (url: string) => Promise<ExtractedListing>.
    const capturedHtml = html;
    const capturedSourceUrl = sourceUrl;
    const capturedInnerText = innerText;
    const capturedIframes = iframes;

    // withBudget race: the losing addListing may continue running after the
    // 504 response is sent. If it completes and inserts the row, the user's
    // retry will see alreadySaved: true — dedup makes the retry converge safely.
    const result = await withBudget(
      addListing(sourceUrl, {
        extract: (_url: string) =>
          extractListingFromHtml(capturedHtml, capturedSourceUrl, {
            innerText: capturedInnerText,
            iframes: capturedIframes,
          }),
        geocode: geocodeAddress,
        db: auth.db,
        userId: auth.userId,
        placesApiKey: process.env['GOOGLE_PLACES_API_KEY'],
        // onSaved: fire analysis asynchronously so the extension gets an
        // immediate response. Write-through is best-effort.
        // after() persists the analysis work past the Vercel response boundary
        // so the function stays alive until firstSaveAnalysis completes.
        onSaved: (listingId: string) => {
          after(() => fireAnalysis(auth, listingId));
        },
        // Background nickname generation (AIN-95) — hand the task to Next's
        // after() so the lambda survives long enough for the background LLM
        // call, same pattern as onSaved above.
        scheduleBackground: (task) => after(task),
      }),
      budgetMs,
    );

    const isNewSave = !result.alreadySaved;
    // checkNeedsEnrichment is a fast PK SELECT run OUTSIDE withBudget by design —
    // same as enqueueDeepExtract below. Neither is an unbounded round-trip inside
    // the extraction budget; both are cheap post-save book-keeping operations.
    const needsDeepScan =
      isNewSave && await checkNeedsEnrichment(auth, result.listingId, result.confidence);

    // Await enqueue OUTSIDE withBudget so a slow DB insert can't trigger a 504
    // after the listing was already saved. A 3s timeout races the insert and
    // resolves to 'failed' on timeout — keeps the request fast.
    // deepScanQueued is truthful: only true when the insert actually succeeded
    // (or was already-queued via 23505). Never set based on confidence alone.
    let enqueueResult: EnqueueResult = 'failed';
    if (needsDeepScan) {
      // AIN-78: persist the extension-captured HTML before enqueueing so
      // crawl_source can reuse it. Best-effort — failure is logged and
      // swallowed; the mission is still enqueued and the response is unaffected.
      await persistCapture(auth, result.listingId, capturedHtml);

      try {
        enqueueResult = await Promise.race([
          enqueueDeepExtract(auth, result.listingId, sourceUrl),
          new Promise<EnqueueResult>((resolve) =>
            setTimeout(() => resolve('failed'), 3_000),
          ),
        ]);
      } catch {
        enqueueResult = 'failed';
      }
      // Poke the worker only on a genuine new insert (nothing new to process on 23505)
      if (enqueueResult === 'inserted') {
        pokeMissionWorker();
      }
    }

    const deepScanQueued =
      enqueueResult === 'inserted' || enqueueResult === 'already_queued';

    const status = result.alreadySaved ? 200 : 201;
    return NextResponse.json(
      {
        ...result,
        summary: buildSummary(result.listingId, result.alreadySaved),
        // Inform the extension popup that analysis is computing asynchronously.
        // Only set on 201 (new saves); already-saved rows were analyzed at first save.
        ...(isNewSave ? { analysisPending: true } : {}),
        ...(deepScanQueued ? { deepScanQueued: true } : {}),
      },
      { status, headers: corsHeaders },
    );
  } catch (err: unknown) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json(
        { error: 'Request timeout: processing budget exceeded', code: 'budget_exceeded' },
        { status: 504, headers: corsHeaders },
      );
    }

    if (err instanceof AddListingError) {
      const httpStatus = ADD_LISTING_ERROR_STATUS[err.code] ?? 500;
      // db_error messages may contain raw PostgreSQL/PostgREST detail — sanitise.
      const safeMessage = SAFE_USER_MESSAGE_CODES.has(err.code)
        ? err.userMessage
        : 'Something went wrong saving that listing. Please try again.';
      return NextResponse.json(
        { error: safeMessage, code: err.code },
        { status: httpStatus, headers: corsHeaders },
      );
    }

    console.error('[crm/ingest] Unexpected error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: 'Something went wrong saving that listing. Please try again.' },
      { status: 500, headers: corsHeaders },
    );
  }
}
