/**
 * GET /api/crm/saved?sourceUrl=<url> (AIN-72 — in-page save button already-saved check)
 *
 * Called by the Chrome extension content script on page load to determine
 * whether the current listing is already in the user's CRM. Returns
 * `{ saved: true, listingId }` or `{ saved: false }`.
 *
 * This endpoint is intentionally lightweight — it runs one indexed point-read
 * against crm_listings (user_id + source_url unique index, non-archived rows).
 * The response is never cached: the extension polls once per page visit.
 *
 * FAIL-OPEN: network errors from the extension side degrade to idle (the
 * content script swallows errors from CHECK_SAVED and leaves the button in
 * the `idle` state). This route only needs to return a correct response; it
 * does not need to handle the degraded case.
 *
 * AUTH: Bearer token only (same as POST /api/crm/ingest). Guests/anonymous
 * users return AUTH_REQUIRED from the SW, so this route is only called when
 * the extension is authenticated.
 *
 * RATE LIMIT: 120 requests per hour per user. One detail-page visit triggers
 * one CHECK_SAVED message — 120/hr is generous for manual browsing but still
 * bounded. Same in-process caveat as the ingest limiter; AIN-69 covers the
 * durable upgrade.
 *
 * CORS: OPTIONS preflight for the single configured extension origin
 * (CRM_EXTENSION_ORIGIN env var), same as the ingest route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { normalizeSourceUrl } from '@campusnest/ai';
import { resolveCrmAuthFromBearer } from '../_lib/auth';
import { buildExtensionCorsHeaders } from '../_lib/extension-cors';
import { sourceUrlSchema } from '../_lib/source-url-schema';
import { createSlidingWindowLimiter } from '../_lib/sliding-window-limiter';

// ---------------------------------------------------------------------------
// Rate limiter — 120 saved-checks per hour per user
// ---------------------------------------------------------------------------

/**
 * Sliding-window config (exported so the rate-limit test can exhaust it without
 * hardcoding 120 and can reset state between test cases).
 *
 * MULTI-INSTANCE CAVEAT: same as the ingest limiter — in-process Map, not
 * DB-backed. AIN-69 covers the durable upgrade.
 */
export const SAVED_RATE_LIMIT = {
  maxRequests: 120,
  windowMs: 60 * 60 * 1000, // 1 hour
} as const;

const _savedLimiter = createSlidingWindowLimiter({
  maxRequests: SAVED_RATE_LIMIT.maxRequests,
  windowMs: SAVED_RATE_LIMIT.windowMs,
});

/** Test helper — never call in production. */
export function _resetSavedLimiterForTests(): void {
  _savedLimiter._resetForTests();
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/** OPTIONS — CORS preflight for the Chrome extension. */
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  const corsHeaders = buildExtensionCorsHeaders(origin);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** GET /api/crm/saved?sourceUrl=<url> */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  const corsHeaders = buildExtensionCorsHeaders(origin);

  // 1. Auth — Bearer token only
  const auth = await resolveCrmAuthFromBearer(request);
  if (!auth) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401, headers: corsHeaders },
    );
  }

  // 2. Rate limit — check before any DB work
  const rateCheck = _savedLimiter.check(auth.userId);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. Please wait before checking more listings.',
        retryAfterSeconds: Math.ceil(rateCheck.retryAfterMs / 1000),
      },
      { status: 429, headers: corsHeaders },
    );
  }

  // 3. Validate sourceUrl query parameter
  const rawSourceUrl = request.nextUrl.searchParams.get('sourceUrl');
  const parsed = sourceUrlSchema.safeParse(rawSourceUrl ?? '');
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid sourceUrl parameter', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders },
    );
  }

  // AIN-98: normalize BEFORE the query — the extension always sends
  // Chrome's fragment-inclusive `location.href` (background/index.ts), so a
  // unit-anchor variant (`#udp-<zpid>`) of a saved building must resolve to
  // the SAME identity `addListing` stored, or the button never shows
  // "already saved" on that anchor. See ../source-url.ts for the full
  // normalization contract.
  const sourceUrl = normalizeSourceUrl(parsed.data);

  // 4. Record the rate-limit slot after auth + validation pass
  _savedLimiter.record(auth.userId);

  // 5. Point-read: does a non-archived row exist for this (user_id, source_url)?
  const { data } = await auth.db
    .from('crm_listings')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('source_url', sourceUrl)
    .neq('status', 'archived')
    .order('saved_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json(
    { saved: Boolean(data), listingId: (data as { id?: string } | null)?.id },
    { status: 200, headers: corsHeaders },
  );
}
