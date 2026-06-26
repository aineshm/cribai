/**
 * crawl_source step for crm_deep_extract mission (AIN-71, AIN-78).
 *
 * 1. Re-reads the crm_listings row; skips if missing / archived / wrong user.
 * 2. AIN-78: looks up crm_listing_captures for extension-captured HTML. When
 *    present, uses it as the landing page source (bypasses the server-side
 *    fetch that anti-bot sites like Zillow block). Deletes the capture row
 *    after reading (self-consuming, best-effort).
 * 3. Falls back to fetching the source URL (SSRF-guarded via fetchPublicHtml)
 *    when no capture is present.
 * 4. Extracts fields from the landing page.
 * 5. Discovers and fetches up to 4 housing-related subpages.
 * 6. Filters subpages via isHousingRelated; discards non-housing pages.
 * 7. Outputs pages + discarded (JSONB-safe: no raw HTML stored).
 */

import type { MissionStep, StepContext, StepResult } from '../../types';
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
  readonly html: string;
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
 * AIN-78: Look up the extension-captured HTML for a listing.
 * Returns the captured html string, or null when no capture exists / on error.
 * Never throws — failures are silently swallowed; the caller falls back to fetch.
 */
async function lookupCapture(
  supabase: SupabaseClient,
  listingId: string,
): Promise<string | null> {
  try {
    const { data } = (await supabase
      .from('crm_listing_captures')
      .select('html')
      .eq('listing_id', listingId)
      .maybeSingle()) as { data: CaptureRow | null; error: unknown };
    return data?.html ?? null;
  } catch {
    return null;
  }
}

/**
 * AIN-78: Best-effort delete of a consumed capture row. Called after the HTML
 * has been read so storage never accumulates. Logs on failure but never throws.
 */
async function deleteCapture(
  supabase: SupabaseClient,
  listingId: string,
): Promise<void> {
  try {
    await supabase
      .from('crm_listing_captures')
      .delete()
      .eq('listing_id', listingId);
  } catch (err) {
    console.warn(
      '[crawl_source] capture delete failed (non-fatal):',
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
    // 2. AIN-78: Use extension capture as landing page when present
    // -------------------------------------------------------------------------
    const captureHtml = await lookupCapture(ctx.supabase, listingId);

    if (captureHtml !== null) {
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

      // Self-consume the capture (best-effort) after reading.
      await deleteCapture(ctx.supabase, listingId);

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
    // 3. Fetch + extract landing page (fallback when no capture)
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
