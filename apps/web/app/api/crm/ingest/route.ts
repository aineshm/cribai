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

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  addListing,
  AddListingError,
  extractListingFromHtml,
  geocodeAddress,
  firstSaveAnalysis,
  type AddListingErrorCode,
} from '@campusnest/ai';
import { resolveCrmAuthFromBearer, type CrmAuth } from '../_lib/auth';
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
  sourceUrl: z
    .string()
    .trim() // match listings-route schema; prevents whitespace-variant dedup misses
    .min(1)
    .max(2048)
    .refine(
      (value) => {
        try {
          const protocol = new URL(value).protocol;
          return protocol === 'http:' || protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'Only http(s) listing URLs are supported' },
    ),
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
  let rawBody: unknown;
  try {
    rawBody = await request.json();
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

  const { sourceUrl, html } = parsed.data;

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

    // withBudget race: the losing addListing may continue running after the
    // 504 response is sent. If it completes and inserts the row, the user's
    // retry will see alreadySaved: true — dedup makes the retry converge safely.
    const result = await withBudget(
      addListing(sourceUrl, {
        extract: (_url: string) =>
          extractListingFromHtml(capturedHtml, capturedSourceUrl),
        geocode: geocodeAddress,
        db: auth.db,
        userId: auth.userId,
        placesApiKey: process.env['GOOGLE_PLACES_API_KEY'],
        // onSaved: fire analysis asynchronously so the extension gets an
        // immediate response. Write-through is best-effort.
        onSaved: (listingId: string) => {
          void fireAnalysis(auth, listingId);
        },
      }),
      budgetMs,
    );

    const status = result.alreadySaved ? 200 : 201;
    return NextResponse.json(
      {
        ...result,
        summary: buildSummary(result.listingId, result.alreadySaved),
        // Inform the extension popup that analysis is computing asynchronously.
        // Only set on 201 (new saves); already-saved rows were analyzed at first save.
        ...(result.alreadySaved ? {} : { analysisPending: true }),
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
