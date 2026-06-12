/**
 * crawl_source step for crm_deep_extract mission (AIN-71).
 *
 * 1. Re-reads the crm_listings row; skips if missing / archived / wrong user.
 * 2. Fetches the source URL (SSRF-guarded via fetchPublicHtml).
 * 3. Extracts fields from the landing page.
 * 4. Discovers and fetches up to 4 housing-related subpages.
 * 5. Filters subpages via isHousingRelated; discards non-housing pages.
 * 6. Outputs pages + discarded (JSONB-safe: no raw HTML stored).
 */

import type { MissionStep, StepContext, StepResult } from '../../types';
import { extractListingFromHtml } from '../../../extraction/extract-from-html';
import { fetchPublicHtml, ExtractionError } from '../../../extraction';
import { pruneHtml } from '../../../extraction/prune-html';
import { discoverSubpages, isHousingRelated } from '../lib/subpage-discovery';
import type { ExtractedListing } from '../../../extraction/types';

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

export interface CrawlSourcePage {
  url: string;
  fields: Partial<ExtractedListing>;
  textExcerpt: string;
}

export interface CrawlSourceOutput {
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
    // 2. Fetch + extract landing page
    // -------------------------------------------------------------------------
    const fetcher = resolveFetcher(ctx);

    let landingHtml: string;
    try {
      landingHtml = await fetcher(sourceUrl);
    } catch (err) {
      // Landing page fetch failure → throw (retryable by the executor)
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`crawl_source: failed to fetch landing page ${sourceUrl}: ${msg}`);
    }

    let landingFields: Partial<ExtractedListing> = {};
    try {
      landingFields = await extractListingFromHtml(landingHtml, sourceUrl);
    } catch {
      // Tolerate extraction failure on landing page; continue with empty fields
    }

    const landingExcerpt = pruneHtml(landingHtml).slice(0, MAX_TEXT_EXCERPT_CHARS);

    const pages: CrawlSourcePage[] = [
      { url: sourceUrl, fields: landingFields, textExcerpt: landingExcerpt },
    ];

    // -------------------------------------------------------------------------
    // 3. Discover + fetch subpages
    // -------------------------------------------------------------------------
    const subpageUrls = discoverSubpages(landingHtml, sourceUrl);
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

    return {
      output: {
        pages,
        discarded,
      },
    };
  },
};
