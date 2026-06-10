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
import { normalizeFields, inRange, NUMERIC_MAX } from './normalize';
import { extractFromDom } from './dom';
import { pruneHtml } from './prune-html';
import { createLlmExtractor } from './llm-parse';
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
  type ExtractionMethod,
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
 * Which extraction layers contributed at least one field to the merged result.
 * Built in `extractListing` and consumed by both `deriveExtractionMethod` (to
 * name the method) and `computeConfidence` (to weight trust).
 */
type Contributor = 'json_ld' | 'og' | 'dom' | 'llm';

/**
 * Fixed precedence order for `extraction_method`. The method string joins the
 * contributing layers in THIS order with `_plus_`, regardless of the order they
 * were added to the set — so `{dom, json_ld}` → `'json_ld_plus_dom'`. Every
 * subsequence of this list is a literal of `ExtractionMethod` (Task 1
 * enumerated all 15 combinations), so the join is type-safe by construction.
 */
const METHOD_ORDER: readonly Contributor[] = ['json_ld', 'og', 'dom', 'llm'];

/**
 * Derive the `extraction_method` literal from the set of contributing layers.
 * Joins present layers in `METHOD_ORDER` with `_plus_`. The result is always a
 * member of the `ExtractionMethod` union (the union enumerates every
 * subsequence). `extractListing` guarantees the set is non-empty before calling
 * this — an empty set would have thrown `no_listing_data` first.
 */
export function deriveExtractionMethod(contributors: ReadonlySet<Contributor>): ExtractionMethod {
  const present = METHOD_ORDER.filter((c) => contributors.has(c));
  return present.join('_plus_') as ExtractionMethod;
}

/**
 * Compute confidence from the merged field set and which layers contributed.
 *
 * "Key fields" are price / address / bedrooms — the same trio the escalation
 * gate uses. A non-LLM path is JSON-LD or DOM (both read structured / labeled
 * data); the LLM rare path is trusted less because it reads free text.
 *
 *   high   = price + address + bedrooms ALL present AND at least one non-LLM
 *            layer (json_ld OR dom) contributed. A DOM extractor that pulls all
 *            three is as trustworthy as JSON-LD here.
 *   medium = (a) any one of price/address/bedrooms present via a non-LLM layer;
 *              OR
 *            (b) the LLM contributed and price is present alongside a title or
 *                photos (the model found enough structure to be useful);
 *              OR
 *            (c) OG-only path that produced a price plus a title or photo array.
 *            An all-three result whose key fields arrived via the LLM is CAPPED
 *            here — the LLM only runs when cheaper layers missed a key field,
 *            so any LLM contribution is, by construction, a key field.
 *   low    = anything else.
 */
export function computeConfidence(
  merged: ExtractedFields,
  contributors: ReadonlySet<Contributor>,
): 'high' | 'medium' | 'low' {
  const hasPrice = typeof merged.price === 'number';
  const hasAddress = typeof merged.address === 'string';
  const hasBedrooms = typeof merged.bedrooms === 'number';
  const allThree = hasPrice && hasAddress && hasBedrooms;

  const hasNonLlmStructured = contributors.has('json_ld') || contributors.has('dom');
  const llmContributed = contributors.has('llm');
  const ogContributed = contributors.has('og');

  // high: full key set from a trusted (non-LLM) structured/labeled layer.
  if (allThree && hasNonLlmStructured && !llmContributed) return 'high';

  // medium cap: a full key set whose deciding fields came via the LLM is
  // demoted from high to medium — the LLM is trusted less than structured/DOM,
  // but all three key fields present is still a solid result.
  if (allThree && llmContributed) return 'medium';

  // medium (a): at least one key field from a non-LLM layer.
  if (hasNonLlmStructured && (hasPrice || hasAddress || hasBedrooms)) return 'medium';
  // medium (b): LLM filled in, but it found a price plus some descriptive shape.
  if (llmContributed && hasPrice && (merged.title || merged.photos?.length)) return 'medium';
  // medium (c): OG-only with price + a title or photo array.
  if (ogContributed && hasPrice && (merged.title || merged.photos?.length)) return 'medium';

  return 'low';
}

/**
 * The escalation gate. A result is "good enough" when it carries a price AND
 * either a bedroom count or an address — the minimum a downstream `addListing`
 * call needs to be useful. Evaluated on RAW (pre-normalize) merged fields,
 * matching how price/bedrooms/address are typed before normalization.
 *
 * When this returns true the orchestrator stops escalating; when it returns
 * false it falls through to the next (more expensive) layer.
 */
function hasKeyFields(f: ExtractedFields): boolean {
  // Use the SAME validity predicate as `normalizeFields` (`inRange`: finite &&
  // within [0, sane-max]). A number `normalizeFields` will later DROP must not
  // satisfy the gate — otherwise it suppresses the DOM/LLM rescue and is then
  // dropped, leaving a method like `json_ld` with no price. In practice
  // `dropInvalidNumerics` already scrubs such values out of `merged` before this
  // runs, so this is belt-and-braces; keeping it single-sourced means the two
  // can never drift. Address stays a plain string check.
  return (
    inRange(f.price, NUMERIC_MAX.PRICE) &&
    (inRange(f.bedrooms, NUMERIC_MAX.BEDROOMS) || typeof f.address === 'string')
  );
}

/**
 * Delete numeric fields that `normalizeFields` would later drop (non-finite,
 * negative, or absurdly large) from a layer's partial, IN PLACE, returning the
 * same object. Run on each layer's output BEFORE it enters `merged` so an
 * invalid value never (a) satisfies `hasKeyFields` and suppresses escalation,
 * nor (b) occupies a field slot that `fillGaps` then refuses to overwrite with
 * a later layer's VALID value (`fillGaps` fills gaps only). Single-sourced with
 * `normalizeFields` via `inRange`/`NUMERIC_MAX` so the two can't disagree.
 */
function dropInvalidNumerics<T extends Partial<ExtractedFields>>(fields: T): T {
  if (!inRange(fields.price, NUMERIC_MAX.PRICE)) delete fields.price;
  if (!inRange(fields.bedrooms, NUMERIC_MAX.BEDROOMS)) delete fields.bedrooms;
  if (!inRange(fields.bathrooms, NUMERIC_MAX.BATHROOMS)) delete fields.bathrooms;
  if (!inRange(fields.square_feet, NUMERIC_MAX.SQUARE_FEET)) delete fields.square_feet;
  return fields;
}

/**
 * Fill gaps in `merged` from a layer's partial result: assign a field ONLY when
 * `merged` doesn't already have it. Never overwrites a value an earlier (more
 * trusted) layer set. Mutates `merged` in place and returns whether the partial
 * contributed at least one field (used to mark the layer as a contributor).
 *
 * `raw_og` / `raw_json_ld` are debug blobs already attached by earlier layers;
 * the DOM and LLM layers don't produce them, so this only walks the real
 * listing fields.
 *
 * Array fields (`photos` / `amenities`) are filled WHOLE-FIELD, not merged: a
 * layer that set `photos` at all blocks a richer `photos` set from a later
 * layer. This is deliberate — it mirrors `mergeFields` and keeps each field's
 * value sourced from a single, most-trusted layer rather than stitching arrays
 * across layers of differing trust.
 */
function fillGaps(merged: ExtractedFields, partial: Partial<ExtractedFields>): boolean {
  let contributed = false;
  for (const key of Object.keys(partial) as (keyof ExtractedFields)[]) {
    const value = partial[key];
    if (value === undefined) continue;
    if (merged[key] !== undefined) continue;
    (merged as Record<string, unknown>)[key] = value;
    contributed = true;
  }
  return contributed;
}

/**
 * Whether the LLM rare path is reachable. Skips the LLM pass when no extractor
 * is injected AND no Gemini credentials are configured. `createLlmExtractor()`
 * is a pure factory — it returns a closure and never throws; the
 * `createGeminiClient()` call happens INSIDE that closure and is already caught
 * (the closure returns `{}` on any throw). So this gate is purely an
 * optimization: it only saves an allocation plus a thrown-and-caught exception
 * per call in credential-less CI, where the LLM pass could never produce
 * fields anyway. Tests inject `opts.llmExtractor` (always runs); production
 * with creds always runs it.
 */
function llmPathAvailable(opts: ExtractListingOptions): boolean {
  if (opts.llmExtractor) return true;
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_PROJECT);
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

  const source_domain = deriveSourceDomain(finalUrl);

  // ── Pass 1: STRUCTURED (JSON-LD + OpenGraph) ────────────────────────────
  // Relative URLs (image / og:image) in the served HTML resolve against the
  // post-redirect URL, not the input URL — otherwise a redirector / shortener
  // would rewrite asset paths against the wrong origin (codex round 6 P2).
  const jsonLd = extractFromJsonLd(html, finalUrl);
  const og = extractFromOg(html, finalUrl);
  const { merged, ogContributed } = mergeFields(jsonLd, og);
  // Scrub numbers `normalizeFields` would drop (negative / non-finite / absurd)
  // out of the Pass-1 result BEFORE the gate — so a corrupt structured price
  // can't both fail the gate's escalation AND block a later layer's valid value.
  dropInvalidNumerics(merged);

  const contributors = new Set<Contributor>();
  if (jsonLd !== null) contributors.add('json_ld');
  if (ogContributed) contributors.add('og');

  // ── Escalation: only when the structured pass missed the key fields. ────
  // Each later layer is more expensive (DOM regex, then a model call), so we
  // stop the moment the key-fields gate is satisfied. DOM/LLM fill GAPS only —
  // they never overwrite a value an earlier, more-trusted layer set.
  if (!hasKeyFields(merged)) {
    // Pass 2: DOM (per-site extractor; only sites with one return data).
    try {
      const domFields = extractFromDom(html, finalUrl, source_domain);
      if (fillGaps(merged, dropInvalidNumerics(domFields))) contributors.add('dom');
    } catch {
      // `extractFromDom` already swallows per-site errors and returns {}, but
      // the orchestrator must not break even if that contract ever regresses.
    }

    // Pass 3: LLM rare path — last resort, still missing key fields.
    if (!hasKeyFields(merged) && llmPathAvailable(opts)) {
      try {
        const llm = opts.llmExtractor ?? createLlmExtractor();
        const llmFields = await llm(pruneHtml(html), finalUrl);
        if (fillGaps(merged, dropInvalidNumerics(llmFields))) contributors.add('llm');
      } catch {
        // The LLM extractor is contracted never to throw, but a custom
        // injected one (or a future change) might — degrade to no-LLM-fields.
      }
    }
  }

  // ── Finalize: single normalization pass over the fully-merged fields. ───
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
      `No extraction layer (JSON-LD, OpenGraph, DOM, or LLM) produced any usable fields for ${url}`,
      url,
    );
  }

  const extraction_method = deriveExtractionMethod(contributors);
  const extraction_confidence = computeConfidence(normalized, contributors);

  return {
    source_url: url,
    // codex P2: `source_domain` should reflect where the listing actually
    // lives, not the shortener / tracking redirector the user happened to
    // paste. Use the post-redirect URL so per-publisher logic (e.g. Zillow
    // vs Apartments.com handling in downstream tools) keys correctly. The
    // user-facing `source_url` stays as the input — that's the link they
    // care about. Computed once above (`source_domain`) so the escalation
    // DOM dispatch and the returned field key off the same value.
    source_domain,
    ...normalized,
    extraction_method,
    extraction_confidence,
  };
}
