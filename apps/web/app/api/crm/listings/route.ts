/**
 * /api/crm/listings (AIN-61 — CRM REST reads/writes, Workstream 1)
 *
 *   GET  — the viewer's non-archived crm_listings, saved_at desc, plus the
 *          viewer identity (drives the front-end's synthesized single-member
 *          list — collaboration itself stays mock-only).
 *   POST — { sourceUrl } → addListing core (extract + geocode + dedup + insert)
 *          → AddListingResult. 201 on a new save, 200 when already saved.
 *
 * Auth follows /api/conversations: RLS-scoped client (user_id = auth.uid()),
 * dev-auth fallback, 401 unauthenticated. Inert in prod until the UI flags
 * (NEXT_PUBLIC_CRM_ENABLED / NEXT_PUBLIC_CRM_MOCK) flip.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import {
  addListing,
  AddListingError,
  extractListing,
  geocodeAddress,
  type AddListingErrorCode,
  type ExtractedListing,
} from '@campusnest/ai';
import { resolveCrmAuth } from '../_lib/auth';

/** Columns mirroring CrmListingRow (coordinates intentionally omitted — WKB). */
const LISTING_COLUMNS = [
  'id',
  'user_id',
  'source_url',
  'source_site',
  'title',
  'nickname',
  'address',
  'rent',
  'bedrooms',
  'bathrooms',
  'sqft',
  'available_from',
  'description',
  'amenities',
  'photo_urls',
  'extraction_confidence',
  'status',
  'user_notes',
  'saved_at',
  // AIN-83: expose ONLY the deep_extract subtree (floor_plans / price_is_from)
  // via a PostgREST JSON-path alias — never `raw_extraction` wholesale, which
  // holds multi-KB raw JSON-LD/OG blobs the browser never needs.
  'deep_extract:raw_extraction->deep_extract',
].join(', ');

const MAX_LISTINGS = 200;

/**
 * Per-user save cap (matches the MAX_LISTINGS read cap). Every save triggers a
 * server-side fetch + possible LLM parse + geocode — the cap bounds the
 * write-side cost a single account can generate (review HIGH, AIN-61).
 */
export const MAX_SAVED_LISTINGS = 200;

const createBodySchema = z.object({
  sourceUrl: z
    .string()
    .trim()
    .max(2048)
    .url()
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
});

/** HTTP status for each AddListingError code (extraction upstream vs our fault). */
const ADD_LISTING_ERROR_STATUS: Readonly<Record<AddListingErrorCode, number>> = {
  fetch_blocked: 502,
  fetch_failed: 502,
  parse_failed: 422,
  no_listing_data: 422,
  db_error: 500,
};

/** GET /api/crm/listings — the viewer's saved (non-archived) CRM listings. */
export async function GET(_request: NextRequest) {
  const auth = await resolveCrmAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data, error } = await auth.db
    .from('crm_listings')
    .select(LISTING_COLUMNS)
    .eq('user_id', auth.userId)
    .neq('status', 'archived')
    .order('saved_at', { ascending: false })
    .range(0, MAX_LISTINGS - 1);

  if (error) {
    console.error('[crm/listings] List error:', error);
    return NextResponse.json({ error: 'Failed to load saved listings' }, { status: 500 });
  }

  return NextResponse.json({
    listings: data ?? [],
    viewer: { id: auth.userId, name: auth.displayName },
  });
}

/** POST /api/crm/listings — save a listing URL via the addListing core. */
export async function POST(request: NextRequest) {
  const auth = await resolveCrmAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Per-user row cap before any extraction work (429: the account is at its
  // budget for saved listings; archiving frees slots).
  const { count, error: countError } = await auth.db
    .from('crm_listings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.userId)
    .neq('status', 'archived');
  if (countError) {
    console.error('[crm/listings] Cap check error:', countError);
    return NextResponse.json({ error: 'Failed to save listing' }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_SAVED_LISTINGS) {
    return NextResponse.json(
      {
        error: `You've reached the limit of ${MAX_SAVED_LISTINGS} saved listings. Archive some to make room.`,
      },
      { status: 429 },
    );
  }

  try {
    // Same dep wiring as the add_listing tool handler (no onSaved hook — the
    // front end pulls the analysis via GET …/analysis afterwards).
    const extract = extractListing as (url: string, opts?: unknown) => Promise<ExtractedListing>;
    const result = await addListing(parsed.data.sourceUrl, {
      extract,
      geocode: geocodeAddress,
      db: auth.db,
      userId: auth.userId,
      placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
      // Background nickname generation (AIN-95) — hand the task to Next's
      // after() so the lambda survives long enough for the background LLM
      // call to complete.
      scheduleBackground: (task) => after(task),
    });

    return NextResponse.json(result, { status: result.alreadySaved ? 200 : 201 });
  } catch (err: unknown) {
    if (err instanceof AddListingError) {
      return NextResponse.json(
        { error: err.userMessage, code: err.code },
        { status: ADD_LISTING_ERROR_STATUS[err.code] ?? 500 },
      );
    }
    console.error('[crm/listings] Save error:', err);
    return NextResponse.json(
      { error: 'Something went wrong saving that listing. Please try again.' },
      { status: 500 },
    );
  }
}
