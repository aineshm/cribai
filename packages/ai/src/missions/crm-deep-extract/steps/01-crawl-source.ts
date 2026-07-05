/**
 * crawl_source step for crm_deep_extract mission (AIN-71, AIN-78, AIN-84).
 *
 * 1. Re-reads the crm_listings row; skips if missing / archived / wrong user.
 * 2. AIN-84: looks up the crm_listing_captures pointer row and downloads the
 *    gzipped capture object from the private listing-captures bucket. When
 *    present, uses it as the landing page source (bypasses the server-side
 *    fetch that anti-bot sites like Zillow block). Marks the capture consumed
 *    (consumed_at) after reading — row and object are retained for the
 *    retention window (audit/eval corpus) and deleted by the nightly sweep.
 * 3. Falls back to fetching the source URL (SSRF-guarded via fetchPublicHtml)
 *    when no capture is present or the storage download fails.
 * 4. Extracts fields from the landing page.
 * 5. Discovers and fetches up to 4 housing-related subpages.
 * 6. Filters subpages via isHousingRelated; discards non-housing pages.
 * 7. Outputs pages + discarded (JSONB-safe: no raw HTML stored).
 */

import type { MissionStep, StepContext, StepResult } from '../../types';
import { downloadCapture } from '@campusnest/supabase/storage';
import { extractListingFromHtml } from '../../../extraction/extract-from-html';
import { fetchPublicHtml, ExtractionError } from '../../../extraction';
import { pruneHtml } from '../../../extraction/prune-html';
import { discoverSubpages, isHousingRelated } from '../lib/subpage-discovery';
import type { ExtractedListing } from '../../../extraction/types';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max chars of pruned-HTML to store as textExcerpt in mission state. */
const MAX_TEXT_EXCERPT_CHARS = 20_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrmListingRow {
  readonly id: string;
  readonly user_id: string;
  readonly title: string | null;
  readonly address: string | null;
  readonly rent: number | null;
  readonly extraction_confidence: number | null;
  readonly status: string | null;
}

interface CaptureRow {
  readonly storage_path: string;
}

export interface CrawlSourcePage {
  url: string;
  fields: Partial<ExtractedListing>;
  textExcerpt: string;
}

export interface CrawlSourceOutput {
  /** 'blocked' when the landing-page fetch was bot-blocked or unreachable. */
  crawl?: 'blocked';
  pages: CrawlSourcePage[];
  discarded: Array<{ url: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the fetch function. Tests inject `ctx.input.fetchHtml` to avoid
 * hitting the network; production falls through to fetchPublicHtml.
 */
function resolveFetcher(ctx: StepContext): typeof fetchPublicHtml {
  const injected = (ctx.input as Record<string, unknown>).fetchHtml;
  if (typeof injected === 'function') {
    // Adapter: tests inject a raw fetch-like function; wrap it to match the
    // fetchPublicHtml(url, opts?) → Promise<string> signature.
    return async (url: string) => {
      const response = await (injected as (url: string) => Promise<Response>)(url);
      if (typeof response === 'string') return response;
      return response.text();
    };
  }
  return fetchPublicHtml;
}

async function fetchAndExtract(
  url: string,
  fetcher: typeof fetchPublicHtml,
): Promise<{ fields: Partial<ExtractedListing>; textExcerpt: string } | null> {
  let html: string;
  try {
    html = await fetcher(url);
  } catch (err) {
    if (err instanceof ExtractionError) return null;
    return null;
  }

  let fields: Partial<ExtractedListing> = {};
  try {
    fields = await extractListingFromHtml(html, url);
  } catch {
    // Extraction failure is tolerated; we still keep textExcerpt
  }

  const textExcerpt = pruneHtml(html).slice(0, MAX_TEXT_EXCERPT_CHARS);
  return { fields, textExcerpt };
}

/**
 * Discover, fetch, and relevance-filter subpages from a landing-page HTML blob.
 * Returns housing-related pages and the list of discarded URLs with reasons.
 * Extracted from `run` to keep each function under 50 lines.
 */
async function processSubpages(
  landingHtml: string,
  sourceUrl: string,
  fetcher: typeof fetchPublicHtml,
): Promise<{ pages: CrawlSourcePage[]; discarded: Array<{ url: string; reason: string }> }> {
  const subpageUrls = discoverSubpages(landingHtml, sourceUrl);
  const pages: CrawlSourcePage[] = [];
  const discarded: Array<{ url: string; reason: string }> = [];

  for (const subUrl of subpageUrls) {
    const result = await fetchAndExtract(subUrl, fetcher);
    if (!result) {
      discarded.push({ url: subUrl, reason: 'fetch_failed' });
      continue;
    }

    // 4. Relevance gate — landing page is exempt; subpages must pass
    if (
      !isHousingRelated(result.textExcerpt, {
        price: typeof result.fields.price === 'number' ? result.fields.price : undefined,
        bedrooms: typeof result.fields.bedrooms === 'number' ? result.fields.bedrooms : undefined,
        address: typeof result.fields.address === 'string' ? result.fields.address : undefined,
      })
    ) {
      discarded.push({ url: subUrl, reason: 'not_housing' });
      continue;
    }

    pages.push({ url: subUrl, fields: result.fields, textExcerpt: result.textExcerpt });
  }

  return { pages, discarded };
}

/**
 * AIN-84: Look up the extension-captured HTML for a listing — pointer row in
 * crm_listing_captures, gzipped object in the private listing-captures bucket.
 * Returns the gunzipped html string, or null when no capture exists / the
 * storage download fails / on any error. Never throws — failures degrade to a
 * capture-miss and the caller falls back to a server-side fetch.
 *
 * Deliberately does NOT filter on `consumed_at`: a consumed capture within
 * the retention window is still readable. This FIXES the old AIN-78 fragile
 * point (delete-on-consume meant a mid-subpage-crawl retry lost the capture);
 * `consumed_at` is bookkeeping for audit/eval, not an access gate.
 *
 * The `user_id` filter is defense-in-depth: the worker runs as service-role
 * (bypasses RLS), so without it a capture row keyed by the same listing_id but
 * owned by another user could be served into this mission. The normal flow can't
 * produce that (listing_id always traces to the owner), but the filter ensures a
 * future bug can never leak one user's captured HTML into another's mission.
 * The object path also embeds the owner's user_id (capturePath convention),
 * and the row's storage_path is only ever written alongside that user_id.
 */
async function lookupCapture(
  supabase: SupabaseClient,
  listingId: string,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = (await supabase
      .from('crm_listing_captures')
      .select('storage_path')
      .eq('listing_id', listingId)
      .eq('user_id', userId)
      .maybeSingle()) as { data: CaptureRow | null; error: unknown };
    if (!data?.storage_path) return null;

    // Ownership check BEFORE downloading: RLS lets an owner UPDATE their own
    // pointer row, so a malicious user could aim storage_path at ANOTHER
    // user's object — and this service-role download would succeed. Refuse
    // any path outside the owner's folder (capturePath convention:
    // `${userId}/…`) and degrade to a capture-miss.
    if (!data.storage_path.startsWith(`${userId}/`)) {
      console.warn(
        '[crawl_source] capture storage_path outside owner folder — treating as miss:',
        data.storage_path,
      );
      return null;
    }

    // downloadCapture returns null (never throws) on any storage failure —
    // treated as a capture-miss so the fetch fallback runs.
    return await downloadCapture(supabase, data.storage_path);
  } catch {
    return null;
  }
}

/**
 * AIN-84: Best-effort mark of a consumed capture (`consumed_at = now()`).
 * Replaces the old AIN-78 delete-on-consume: the row and storage object are
 * RETAINED for the retention window so a bad extraction can be debugged
 * against the exact HTML that produced it, and a mid-subpage-crawl retry can
 * re-read the capture instead of degrading to a blocked server fetch. The
 * nightly cleanup-captures sweep deletes both once past retention.
 *
 * Scoped by `user_id` for the same defense-in-depth reason as `lookupCapture`.
 * Logs on failure but never throws.
 */
async function markCaptureConsumed(
  supabase: SupabaseClient,
  listingId: string,
  userId: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('crm_listing_captures')
      .update({ consumed_at: new Date().toISOString() })
      .eq('listing_id', listingId)
      .eq('user_id', userId);
    if (error) {
      console.warn(
        '[crawl_source] capture consumed-mark failed (non-fatal):',
        (error as { message?: string }).message ?? error,
      );
    }
  } catch (err) {
    console.warn(
      '[crawl_source] capture consumed-mark failed (non-fatal):',
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

export const crawlSourceStep: MissionStep = {
  id: 'crawl_source',
  label: 'Crawling listing source site',

  async run(ctx: StepContext): Promise<StepResult> {
    const listingId = ctx.input.listingId as string;
    const sourceUrl = ctx.input.sourceUrl as string;

    if (!listingId || !sourceUrl) {
      return { output: { skipped: 'missing_input' }, done: true };
    }

    // FIX 7: re-validate JSONB sourceUrl — early exit on non-absolute http(s) URL
    // Prevents the step from fetching attacker-supplied file://, javascript:, etc.
    try {
      const proto = new URL(sourceUrl).protocol;
      if (proto !== 'http:' && proto !== 'https:') {
        return { output: { skipped: 'invalid_input' }, done: true };
      }
    } catch {
      return { output: { skipped: 'invalid_input' }, done: true };
    }

    // -------------------------------------------------------------------------
    // 1. Load row — verify ownership + not-archived
    // -------------------------------------------------------------------------
    const { data: row, error: rowError } = (await ctx.supabase
      .from('crm_listings')
      .select('id, user_id, title, address, rent, extraction_confidence, status')
      .eq('id', listingId)
      .eq('user_id', ctx.userId)
      .maybeSingle()) as { data: CrmListingRow | null; error: unknown };

    if (rowError || !row || row.status === 'archived') {
      return { output: { skipped: 'row_gone' }, done: true };
    }

    // -------------------------------------------------------------------------
    // 2. AIN-84: Use extension capture (private-bucket object) as landing page
    // -------------------------------------------------------------------------
    const captureHtml = await lookupCapture(ctx.supabase, listingId, ctx.userId);

    if (captureHtml) {
      // Use the HTML the user's own browser already loaded — no server-side fetch
      // needed and anti-bot protections (Zillow) are never triggered.
      let landingFields: Partial<ExtractedListing> = {};
      try {
        landingFields = await extractListingFromHtml(captureHtml, sourceUrl);
      } catch {
        // Tolerate extraction failure; fields stay empty
      }

      const landingPage: CrawlSourcePage = {
        url: sourceUrl,
        fields: landingFields,
        textExcerpt: pruneHtml(captureHtml).slice(0, MAX_TEXT_EXCERPT_CHARS),
      };

      // Mark the capture consumed (best-effort) after reading — retained, not
      // deleted, so a retry within retention can re-read it (AIN-84).
      await markCaptureConsumed(ctx.supabase, listingId, ctx.userId);

      // Subpages still require a server-side fetch (uses injected fetcher for tests).
      const fetcher = resolveFetcher(ctx);
      const { pages: subPages, discarded } = await processSubpages(
        captureHtml,
        sourceUrl,
        fetcher,
      );

      return { output: { pages: [landingPage, ...subPages], discarded } };
    }

    // -------------------------------------------------------------------------
    // 3. Fetch + extract landing page (fallback when no capture, or when the
    //    storage download failed — both surface here as captureHtml === null)
    // -------------------------------------------------------------------------
    const fetcher = resolveFetcher(ctx);

    let landingHtml: string;
    let crawlBlocked = false;
    try {
      landingHtml = await fetcher(sourceUrl);
    } catch {
      // Landing page is bot-blocked or unreachable (e.g. Zillow server-side fetch).
      // Record blocked state and return success — places_lookup + reanalyze still run
      // against whatever the user's extension captured. Throwing here would kill the
      // entire mission; returning blocked allows downstream steps to degrade gracefully.
      crawlBlocked = true;
      landingHtml = '';
    }

    if (crawlBlocked) {
      return {
        output: {
          crawl: 'blocked' as const,
          pages: [],
          discarded: [],
        },
      };
    }

    let landingFields: Partial<ExtractedListing> = {};
    try {
      landingFields = await extractListingFromHtml(landingHtml, sourceUrl);
    } catch {
      // Tolerate extraction failure on landing page; continue with empty fields
    }

    const landingPage: CrawlSourcePage = {
      url: sourceUrl,
      fields: landingFields,
      textExcerpt: pruneHtml(landingHtml).slice(0, MAX_TEXT_EXCERPT_CHARS),
    };

    const { pages: subPages, discarded } = await processSubpages(
      landingHtml,
      sourceUrl,
      fetcher,
    );

    return {
      output: {
        pages: [landingPage, ...subPages],
        discarded,
      },
    };
  },
};
