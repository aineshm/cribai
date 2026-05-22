/**
 * Listing extraction service (AIN-13, Days 3-4).
 *
 * Entry point: `extractListing(url, opts?)`.
 *
 * Strategy:
 *   1. Fetch the URL with a sensible bot UA and a 10s timeout.
 *   2. Try JSON-LD extraction (the primary path).
 *   3. Try OpenGraph extraction (the fallback / supplement).
 *   4. Merge: JSON-LD takes precedence per field; OG fills gaps.
 *   5. Compute `extraction_method` and `extraction_confidence` based on
 *      which fields came from where and which key fields are present.
 *
 * Day 5 will add DOM-fallback extractors for sites where the structured-data
 * paths are weak (Zillow + Apartments.com first). Day 6 will add the LLM-clean
 * rare path and the broader 5-site fixture suite at >=90% extraction success.
 */

import { extractFromJsonLd } from './json-ld';
import { extractFromOg } from './og';
import {
  ExtractionError,
  type ExtractedFields,
  type ExtractedListing,
  type ExtractListingOptions,
} from './types';

export {
  ExtractionError,
  type ExtractedListing,
  type ExtractListingOptions,
  type ExtractionErrorCode,
} from './types';
export { parseAllJsonLdBlocks, projectJsonLdEntity, extractFromJsonLd } from './json-ld';
export { parseMetaTags, decodeHtmlEntities, extractFromOg } from './og';

/**
 * The bot user-agent we present to listing sites. Honest about who we are,
 * not pretending to be a browser — this is a B2C product fetching pages a
 * student would otherwise open by hand. Sites that block this can be added
 * to the Day 5 DOM-fallback / Day 6 LLM-clean lists.
 */
const DEFAULT_USER_AGENT = 'CribAI-Listing-Extractor/1.0 (+https://cribai.com/bot)';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Block-detection heuristics — matches the pattern used by
 * `services/scraper/scrapers/craigslist-enrichment.ts`. Case-insensitive
 * substring match on the response body.
 */
const BLOCK_SIGNALS: readonly string[] = [
  'access to this page has been denied',
  'verify you are human',
  'captcha',
  'unusual traffic',
  'pardon our interruption',
];

/**
 * Derive a registrable host like "zillow.com" from a URL. Falls back to the
 * raw hostname if parsing fails (which shouldn't happen since we already
 * fetched the URL successfully).
 */
function deriveSourceDomain(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    // Strip leading "www." for cleaner storage.
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return url;
  }
}

/**
 * Fetch the URL with a hard timeout. Returns the response body text plus
 * the final URL (after redirects) so the caller can resolve relative URLs
 * against the page that actually served the HTML.
 *
 * The timeout is end-to-end: it covers DNS + connection + headers + the
 * body stream. Previously `clearTimeout` ran the moment `fetch()` resolved
 * (headers received), which meant a trickling / stalled body could hang
 * `extractListing()` well past the advertised budget (codex round 6 P1).
 *
 * Throws `ExtractionError` with `fetch_failed` or `fetch_blocked` on failure.
 */
async function fetchHtml(
  url: string,
  fetcher: typeof fetch,
  userAgent: string,
  timeoutMs: number,
): Promise<{ body: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ExtractionError('fetch_failed', `Network error fetching ${url}: ${message}`, url, err);
    }

    if (response.status === 403 || response.status === 429) {
      throw new ExtractionError(
        'fetch_blocked',
        `Blocked by origin (HTTP ${response.status}) fetching ${url}`,
        url,
      );
    }
    if (!response.ok) {
      throw new ExtractionError(
        'fetch_failed',
        `HTTP ${response.status} fetching ${url}`,
        url,
      );
    }

    let body: string;
    try {
      body = await response.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const aborted =
        (err instanceof Error && err.name === 'AbortError') || controller.signal.aborted;
      throw new ExtractionError(
        'fetch_failed',
        aborted
          ? `Body read aborted (timeout ${timeoutMs}ms) for ${url}`
          : `Failed to read body of ${url}: ${message}`,
        url,
        err,
      );
    }

    const lowered = body.toLowerCase();
    if (BLOCK_SIGNALS.some((sig) => lowered.includes(sig))) {
      throw new ExtractionError(
        'fetch_blocked',
        `Page body contains a block / captcha signal (${url})`,
        url,
      );
    }
    // `response.url` is the post-redirect URL when `fetch` follows 3xx; some
    // mock Responses leave it empty, in which case fall back to the input URL.
    const finalUrl = typeof response.url === 'string' && response.url !== '' ? response.url : url;
    return { body, finalUrl };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Merge JSON-LD and OG field maps. JSON-LD wins on every field it provided;
 * OG fills any gaps. Returns the merged field map plus a record of which
 * fields each side contributed (used by confidence scoring).
 */
function mergeFields(
  jsonLd: ReturnType<typeof extractFromJsonLd>,
  og: ReturnType<typeof extractFromOg>,
): {
  merged: ExtractedFields;
  ogContributed: boolean;
} {
  const merged: ExtractedFields = {};
  let ogContributed = false;

  // Start with everything JSON-LD provided.
  if (jsonLd) {
    Object.assign(merged, jsonLd);
  }

  // Fill gaps from OG.
  const ogFields = og.fields;
  const keys: (keyof typeof ogFields)[] = [
    'title',
    'description',
    'price',
    'photos',
    'address',
    'city',
    'state',
    'zip',
  ];
  for (const k of keys) {
    if (merged[k] === undefined && ogFields[k] !== undefined) {
      (merged as Record<string, unknown>)[k] = ogFields[k];
      ogContributed = true;
    }
  }

  // raw_og is always attached when present, even if it didn't fill any field
  // — debug aid, plus the Day 6 LLM-clean path may re-parse it.
  if (og.hasAnyOgData) {
    merged.raw_og = og.raw_og;
  }

  return { merged, ogContributed };
}

/**
 * Compute confidence from the merged field set and which path(s) ran.
 *   high   = JSON-LD provided price + address + bedrooms
 *   medium = JSON-LD partial, OR strong OG (title + description + at least
 *            one of price/photos and JSON-LD also fired)
 *   low    = OG-only with sparse fields, OR JSON-LD that produced almost
 *            nothing
 */
function computeConfidence(
  merged: ExtractedFields,
  hadJsonLd: boolean,
): 'high' | 'medium' | 'low' {
  const hasPrice = typeof merged.price === 'number';
  const hasAddress = typeof merged.address === 'string';
  const hasBedrooms = typeof merged.bedrooms === 'number';

  if (hadJsonLd && hasPrice && hasAddress && hasBedrooms) return 'high';
  if (hadJsonLd && (hasPrice || hasAddress || hasBedrooms)) return 'medium';
  // OG-only path or near-empty JSON-LD.
  if (!hadJsonLd && hasPrice && (merged.title || merged.photos?.length)) return 'medium';
  return 'low';
}

/**
 * Extract a normalized `ExtractedListing` from a listing URL.
 *
 * Fetches the page once, runs the JSON-LD parser, falls back to (or
 * supplements with) OpenGraph, and returns a single normalized record.
 *
 * Throws `ExtractionError` when fetching fails, the origin blocks us,
 * or neither path produced any data (`no_listing_data`).
 *
 * @param url Absolute URL of the external listing page.
 * @param opts Optional fetcher injection + timeout / UA overrides.
 *             Tests should pass `opts.fetcher` to avoid hitting the network.
 */
export async function extractListing(
  url: string,
  opts: ExtractListingOptions = {},
): Promise<ExtractedListing> {
  // Validate up front — bad URLs should be a parse error, not a network error.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (err) {
    throw new ExtractionError('parse_failed', `Invalid URL: ${url}`, url, err);
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ExtractionError('parse_failed', `Unsupported URL scheme: ${parsedUrl.protocol}`, url);
  }

  const fetcher = opts.fetcher ?? fetch;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const { body: html, finalUrl } = await fetchHtml(url, fetcher, userAgent, timeoutMs);

  // Relative URLs (image / og:image) in the served HTML resolve against the
  // post-redirect URL, not the input URL — otherwise a redirector / shortener
  // would rewrite asset paths against the wrong origin (codex round 6 P2).
  const jsonLd = extractFromJsonLd(html, finalUrl);
  const og = extractFromOg(html, finalUrl);
  const { merged, ogContributed } = mergeFields(jsonLd, og);

  const hasAnyField =
    merged.title !== undefined ||
    merged.description !== undefined ||
    merged.price !== undefined ||
    merged.address !== undefined ||
    (merged.photos?.length ?? 0) > 0;

  if (!hasAnyField) {
    throw new ExtractionError(
      'no_listing_data',
      `Neither JSON-LD nor OpenGraph produced any usable fields for ${url}`,
      url,
    );
  }

  let extraction_method: ExtractedListing['extraction_method'];
  if (jsonLd && ogContributed) extraction_method = 'json_ld_plus_og';
  else if (jsonLd) extraction_method = 'json_ld';
  else extraction_method = 'og';

  const extraction_confidence = computeConfidence(merged, jsonLd !== null);

  return {
    source_url: url,
    source_domain: deriveSourceDomain(url),
    ...merged,
    extraction_method,
    extraction_confidence,
  };
}
