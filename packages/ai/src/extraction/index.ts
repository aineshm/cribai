/**
 * Listing extraction service (AIN-13 Days 3-6, AIN-62 HTML seam).
 *
 * Entry points:
 *   - `extractListing(url, opts?)`            — fetch the URL (SSRF-guarded,
 *     redirect-resolved, block-signal checked), then run the shared pipeline.
 *   - `extractListingFromHtml(html, sourceUrl, opts?)` — run the pipeline on
 *     caller-supplied HTML (Chrome-extension capture). See
 *     `extract-from-html.ts`.
 *
 * This module owns everything TRANSPORT: fetching with a bot UA and a 10s
 * timeout, SSRF + scheme validation per redirect hop, the 5MB streamed body
 * cap, and the `BLOCK_SIGNALS` block/captcha heuristic (which applies ONLY
 * to fetch responses — never to caller-supplied HTML; see Phase-0 findings
 * in `extract-from-html.ts`).
 *
 * The post-fetch pipeline (JSON-LD → OG merge → numeric scrub → DOM
 * escalation → LLM rare path → normalize → method/confidence) lives in
 * `extract-from-html.ts` and is shared by both entry points.
 */

import {
  SsrfBlockedError,
  assertHttpScheme,
  assertPublicHost,
  type DnsLookupFn,
} from './ssrf-guard';
import { extractFromHtml, MAX_HTML_BYTES } from './extract-from-html';
import {
  ExtractionError,
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
// Layer 4 (Day 5-6): HTML pruning + the LLM-clean rare path. The orchestration
// that escalates into the LLM extractor lands in Task 3; these are exported now
// so callers (and that wiring) can construct them.
export { pruneHtml } from './prune-html';
export { createLlmExtractor } from './llm-parse';
export type { LlmExtractor, ExtractionMethod } from './types';
// Layer 3 (Day 5-6): per-site DOM fallback extractors. Exported here so the
// escalation wiring in Task 3 can call `extractFromDom`; `extractNextData` is
// surfaced for callers that want the raw Next.js blob without per-site logic.
export { extractFromDom, extractNextData, type SiteExtractor } from './dom';
// AIN-62: the Chrome-extension ingest seam. The unvalidated internal
// pipeline (`extractFromHtml`) is deliberately NOT re-exported (review fix
// L1) — external callers must come through `extractListingFromHtml`, which
// owns the boundary validation; this module imports the pipeline directly.
export {
  extractListingFromHtml,
  deriveSourceDomain,
  deriveExtractionMethod,
  computeConfidence,
  MAX_HTML_BYTES,
  MAX_SEAM_HTML_BYTES,
  MAX_SOURCE_URL_CHARS,
  type ExtractListingFromHtmlOptions,
} from './extract-from-html';

/**
 * The bot user-agent we present to listing sites. Honest about who we are,
 * not pretending to be a browser — this is a B2C product fetching pages a
 * student would otherwise open by hand. Sites that block this can be added
 * to the Day 5 DOM-fallback / Day 6 LLM-clean lists.
 */
const DEFAULT_USER_AGENT = 'CribAI-Listing-Extractor/1.0 (+https://cribai.com/bot)';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Hard cap on response body size, enforced via streaming byte-counting (not
 * the 10s timeout, which only caps wall-clock). Single-sourced with the
 * HTML-seam cap in `extract-from-html.ts` so the two entry points can never
 * accept different sizes.
 */
const MAX_BODY_BYTES = MAX_HTML_BYTES;

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
 *
 * FETCH-PATH ONLY. Phase-0 (AIN-62) showed legit browser-served Zillow pages
 * embed the substring "captcha" (reCAPTCHA public-key config), so this
 * heuristic false-positives on caller-supplied HTML. It stays meaningful on
 * server-side fetch responses — a bot-blocked fetch really does render these
 * phrases — and must never be applied in `extract-from-html.ts`.
 */
const BLOCK_SIGNALS: readonly string[] = [
  'access to this page has been denied',
  'verify you are human',
  'captcha',
  'unusual traffic',
  'pardon our interruption',
];

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
 * Fetch public HTML with SSRF protection, redirect resolution, block-signal
 * checking, and a 5MB body cap. Exported for the `crm_deep_extract` mission
 * step that needs to crawl the source site server-side.
 *
 * Throws `ExtractionError` with `fetch_failed` or `fetch_blocked` on failure.
 */
export async function fetchPublicHtml(
  url: string,
  opts: { fetcher?: typeof fetch; timeoutMs?: number; userAgent?: string } = {},
): Promise<string> {
  const fetcher = opts.fetcher ?? fetch;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { body } = await fetchHtml(url, fetcher, userAgent, timeoutMs);
  return body;
}

/**
 * Extract a normalized `ExtractedListing` from a listing URL.
 *
 * Fetches the page once (SSRF-guarded, redirect-resolved, block-signal
 * checked), then runs the shared pipeline in `extract-from-html.ts`.
 *
 * Throws `ExtractionError` when fetching fails, the origin blocks us,
 * or no extraction layer produced any data (`no_listing_data`).
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

  // Shared pipeline: relative URLs resolve against the post-redirect URL;
  // the user-facing `source_url` stays as the input — that's the link they
  // pasted and care about.
  return extractFromHtml(html, finalUrl, {
    llmExtractor: opts.llmExtractor,
    sourceUrl: url,
  });
}

/**
 * Fetch an SSRF-guarded, block-signal-checked HTML page by URL.
 * Returns only the response body text (the full `{body, finalUrl}` tuple is
 * available internally; this surface is kept narrow for callers that only
 * need the HTML — e.g. the crm_deep_extract mission crawl step).
 *
 * Throws `ExtractionError` on network failure, SSRF block, redirect overflow,
 * or a captcha/block signal in the response body.
 */
export async function fetchPublicHtml(
  url: string,
  opts: Pick<ExtractListingOptions, 'fetcher' | 'userAgent' | 'timeoutMs' | 'lookup'> = {},
): Promise<string> {
  const fetcher = opts.fetcher ?? fetch;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const lookup = opts.lookup as DnsLookupFn | undefined;
  const { body } = await fetchHtml(url, fetcher, userAgent, timeoutMs, lookup);
  return body;
}
