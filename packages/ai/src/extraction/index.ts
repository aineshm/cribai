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
 * Common subdomain prefixes that publishers use to serve the same listings
 * the canonical apex serves. Stripping these keeps per-publisher analytics
 * unfragmented when a redirector lands on `cdn.publisher.com` vs
 * `www.publisher.com`. A full eTLD+1 collapse would require the Public
 * Suffix List (out of scope here); the static prefix list catches the
 * cases that matter for housing CDNs without the heavy dep (codex round 3).
 */
const COMMON_SUBDOMAIN_PREFIXES: readonly string[] = [
  'www.',
  'm.',
  'cdn.',
  'static.',
  'assets.',
  'images.',
  'www1.',
  'www2.',
];

/**
 * Derive a registrable-ish host like "zillow.com" from a URL. Strips any
 * sequence of common subdomain prefixes — `cdn.www.publisher.example` →
 * `publisher.example` — so per-publisher analytics doesn't fragment across
 * combined CDN + www / mobile + www layouts.
 *
 * NEVER strips into the publisher's registrable domain. `www.static.com`
 * stays as `static.com`, not `com` — a real site can have an apex label
 * that happens to match one of `COMMON_SUBDOMAIN_PREFIXES` (codex round 5
 * P2). The guard requires the host to retain at least two dotted labels
 * after stripping; we cap stripping there. This is still strictly more
 * conservative than a real eTLD+1 collapse (which would need the Public
 * Suffix List), but it correctly handles every case the codex review
 * raised on this branch.
 *
 * Falls back to the raw hostname if parsing fails (which shouldn't happen
 * since we already fetched the URL successfully).
 */
function deriveSourceDomain(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const prefix of COMMON_SUBDOMAIN_PREFIXES) {
      if (!host.startsWith(prefix)) continue;
      const candidate = host.slice(prefix.length);
      // Don't strip into the registrable domain: a result like `com` or
      // `example` would mean we've eaten the apex label. Require at least
      // 2 dotted parts (1 dot) to remain — covers every gTLD/ccTLD shape
      // without needing the full Public Suffix List.
      if (!candidate.includes('.')) continue;
      host = candidate;
      stripped = true;
      break;
    }
  }
  return host;
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
    // codex P3: enforce the cap by BYTES, not code units. A 4-million-char
    // UTF-8 body of 3-byte glyphs is ~12 MB on the wire even though
    // `text.length` is well under MAX_BODY_BYTES (5 MB). Encode once and
    // measure the byte view to honour the memory-hardening guarantee on
    // the fallback path too. `Buffer.byteLength('utf8')` is O(n) and runs
    // only on this rare branch — `response.body` is present on every real
    // fetch / undici / Response, so the streaming path dominates production.
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > MAX_BODY_BYTES) {
      throw new ExtractionError(
        'fetch_failed',
        `Response body exceeds ${MAX_BODY_BYTES} bytes (text=${bytes}) for ${url}`,
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
  // SSRF + scheme, but `ExtractListingOptions.fetcher` is a `typeof fetch`
  // — a caller-supplied implementation can ignore `redirect: 'manual'` and
  // silently follow 3xx itself, in which case `response.url` reflects a
  // host the SSRF guard never saw. Re-validate the final URL's scheme AND
  // host before we use it as a base for relative URL resolution or hand
  // it back as `source_domain` (codex P2).
  try {
    assertHttpScheme(finalUrl);
    await assertPublicHost(finalUrl, lookup);
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
    // codex P2: `source_domain` should reflect where the listing actually
    // lives, not the shortener / tracking redirector the user happened to
    // paste. Use the post-redirect URL so per-publisher logic (e.g. Zillow
    // vs Apartments.com handling in downstream tools) keys correctly. The
    // user-facing `source_url` stays as the input — that's the link they
    // care about.
    source_domain: deriveSourceDomain(finalUrl),
    ...normalized,
    extraction_method,
    extraction_confidence,
  };
}
