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
import { normalizeFields } from './normalize';
import {
  SsrfBlockedError,
  assertHttpScheme,
  assertPublicHost,
  type DnsLookupFn,
} from './ssrf-guard';
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
export { SsrfBlockedError, assertHttpScheme, assertPublicHost } from './ssrf-guard';
export { LIMITS, filterHttpUrls, normalizeFields } from './normalize';

/**
 * The bot user-agent we present to listing sites. Honest about who we are,
 * not pretending to be a browser — this is a B2C product fetching pages a
 * student would otherwise open by hand. Sites that block this can be added
 * to the Day 5 DOM-fallback / Day 6 LLM-clean lists.
 */
const DEFAULT_USER_AGENT = 'CribAI-Listing-Extractor/1.0 (+https://cribai.com/bot)';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Hard cap on response body size. Listing pages are typically <2MB even with
 * inline SVGs and base64-encoded hero images; 5MB is a generous budget that
 * still defends against memory blow-up when a malicious origin returns a
 * multi-gigabyte stream. The cap is enforced via streaming byte-counting
 * (not the 10s timeout, which only caps wall-clock).
 */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * Hard cap on redirect chain length. Most legitimate sites use 0-1 hops
 * (canonical-URL rewrites); 3 covers the long tail (Apple-mapped marketing
 * landing → A/B test variant → final). Beyond that we're either looping or
 * being walked into a long indirection chain that's not worth following.
 */
const MAX_REDIRECTS = 3;

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
 * Read a Response body with a hard byte cap. Aborts the controller (and
 * therefore the underlying fetch) the moment the cumulative byte count
 * exceeds `MAX_BODY_BYTES`. Falls back to `response.text()` when the body
 * isn't a `ReadableStream` (some mocks return a plain string body) — in
 * that branch the cap is enforced post-hoc on the decoded text length.
 */
async function readBodyWithCap(
  response: Response,
  controller: AbortController,
  url: string,
): Promise<string> {
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    const text = await response.text();
    if (text.length > MAX_BODY_BYTES) {
      throw new ExtractionError(
        'fetch_failed',
        `Response body exceeds ${MAX_BODY_BYTES} bytes (text=${text.length}) for ${url}`,
        url,
      );
    }
    return text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        controller.abort();
        throw new ExtractionError(
          'fetch_failed',
          `Response body exceeds ${MAX_BODY_BYTES} bytes (read=${total}) for ${url}`,
          url,
        );
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Best-effort release; some implementations throw if the stream is
      // already errored. Swallowing here keeps the original error visible.
    }
  }

  // Reassemble. Sub-allocate once based on total to avoid quadratic copies.
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(merged);
}

/**
 * Perform a single HTTP request with SSRF + body-cap protection. Does NOT
 * follow redirects on its own — that's handled by `fetchHtml` which makes
 * a fresh `fetchOnce` call per hop and re-validates each Location URL.
 */
async function fetchOnce(
  url: string,
  fetcher: typeof fetch,
  userAgent: string,
  controller: AbortController,
  lookup: DnsLookupFn | undefined,
): Promise<Response> {
  // Scheme gate fires first — `assertHttpScheme` is cheap and catches
  // `javascript:` / `data:` / `file:` before we touch DNS.
  assertHttpScheme(url);
  try {
    await assertPublicHost(url, lookup);
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      throw new ExtractionError('fetch_blocked', err.message, url, err);
    }
    throw err;
  }

  try {
    return await fetcher(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'manual',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ExtractionError('fetch_failed', `Network error fetching ${url}: ${message}`, url, err);
  }
}

/**
 * Fetch the URL with SSRF protection, manual redirect resolution, hard
 * end-to-end timeout, and a 5MB body cap. Returns the response body text
 * plus the final URL (post-redirect) so the caller can resolve relative
 * asset URLs against the page that actually served the HTML.
 *
 * Redirect handling is intentionally MANUAL (`redirect: 'manual'`):
 *   - The kernel/fetch follow chain would skip the SSRF host check on the
 *     302 target, opening a "302 → http://169.254.169.254/" bypass.
 *   - Each hop re-runs `assertPublicHost`, so DNS rebinding or open-redirect
 *     chains end at the first private IP.
 *   - Max chain length is `MAX_REDIRECTS` (3); cycles are detected via the
 *     same cap (no per-URL bookkeeping needed for that short a chain).
 *
 * The timeout is end-to-end and covers every redirect hop plus body read.
 *
 * Throws `ExtractionError` with `fetch_failed` or `fetch_blocked` on failure.
 */
async function fetchHtml(
  url: string,
  fetcher: typeof fetch,
  userAgent: string,
  timeoutMs: number,
  lookup?: DnsLookupFn,
): Promise<{ body: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let currentUrl = url;
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await fetchOnce(currentUrl, fetcher, userAgent, controller, lookup);

      // Manual redirect handling: any 3xx with a Location header → re-resolve.
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new ExtractionError(
            'fetch_failed',
            `HTTP ${response.status} with no Location header for ${currentUrl}`,
            url,
          );
        }
        if (hop >= MAX_REDIRECTS) {
          throw new ExtractionError(
            'fetch_failed',
            `Redirect chain exceeds ${MAX_REDIRECTS} hops at ${currentUrl}`,
            url,
          );
        }
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).href;
        } catch (err) {
          throw new ExtractionError(
            'fetch_failed',
            `Unparseable Location ${location} from ${currentUrl}`,
            url,
            err,
          );
        }
        currentUrl = nextUrl;
        continue;
      }

      break;
    }

    if (!response) {
      throw new ExtractionError('fetch_failed', `No response after redirect chain for ${url}`, url);
    }

    if (response.status === 403 || response.status === 429) {
      throw new ExtractionError(
        'fetch_blocked',
        `Blocked by origin (HTTP ${response.status}) fetching ${currentUrl}`,
        url,
      );
    }
    if (!response.ok) {
      throw new ExtractionError(
        'fetch_failed',
        `HTTP ${response.status} fetching ${currentUrl}`,
        url,
      );
    }

    let body: string;
    try {
      body = await readBodyWithCap(response, controller, currentUrl);
    } catch (err) {
      if (err instanceof ExtractionError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const aborted =
        (err instanceof Error && err.name === 'AbortError') || controller.signal.aborted;
      throw new ExtractionError(
        'fetch_failed',
        aborted
          ? `Body read aborted (timeout ${timeoutMs}ms) for ${currentUrl}`
          : `Failed to read body of ${currentUrl}: ${message}`,
        url,
        err,
      );
    }

    const lowered = body.toLowerCase();
    if (BLOCK_SIGNALS.some((sig) => lowered.includes(sig))) {
      throw new ExtractionError(
        'fetch_blocked',
        `Page body contains a block / captcha signal (${currentUrl})`,
        url,
      );
    }
    // `response.url` is meaningful on a real fetch; for the manual-redirect
    // flow we've tracked it explicitly in `currentUrl`.
    const responseFinal =
      typeof response.url === 'string' && response.url !== '' ? response.url : currentUrl;
    return { body, finalUrl: responseFinal };
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
 *   high   = JSON-LD fired AND merged set has price + address + bedrooms
 *   medium = (a) JSON-LD fired AND at least one of price/address/bedrooms,
 *              OR
 *            (b) OG-only path (no JSON-LD) that produced a price plus a
 *                title or photo array — enough structure to be useful.
 *   low    = anything else (OG-only with sparse fields, or JSON-LD that
 *            produced almost nothing).
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
  const lookup = opts.lookup as DnsLookupFn | undefined;

  const { body: html, finalUrl } = await fetchHtml(url, fetcher, userAgent, timeoutMs, lookup);

  // Belt-and-braces: the manual-redirect loop validates each hop's URL via
  // SSRF + scheme, but a test fixture-fetcher that fakes redirects can hand
  // back a `response.url` with a non-http scheme. Re-gate before we use
  // `finalUrl` as a base for relative URL resolution.
  try {
    assertHttpScheme(finalUrl);
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      throw new ExtractionError('fetch_blocked', err.message, url, err);
    }
    throw err;
  }

  // Relative URLs (image / og:image) in the served HTML resolve against the
  // post-redirect URL, not the input URL — otherwise a redirector / shortener
  // would rewrite asset paths against the wrong origin (codex round 6 P2).
  const jsonLd = extractFromJsonLd(html, finalUrl);
  const og = extractFromOg(html, finalUrl);
  const { merged, ogContributed } = mergeFields(jsonLd, og);

  // Apply length/array/scheme/geo/date caps in one place. After this point
  // every field is shape-safe for the downstream `addListing` tool.
  const normalized = normalizeFields(merged);

  const hasAnyField =
    normalized.title !== undefined ||
    normalized.description !== undefined ||
    normalized.price !== undefined ||
    normalized.address !== undefined ||
    (normalized.photos?.length ?? 0) > 0;

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

  const extraction_confidence = computeConfidence(normalized, jsonLd !== null);

  return {
    source_url: url,
    source_domain: deriveSourceDomain(url),
    ...normalized,
    extraction_method,
    extraction_confidence,
  };
}
