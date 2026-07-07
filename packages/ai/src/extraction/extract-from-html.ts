/**
 * The pure (no-network) extraction pipeline (AIN-62).
 *
 * Factored out of `extractListing` so the same post-fetch layers serve two
 * entry points:
 *
 *   - `extractListing(url)`        — fetches, then runs this pipeline
 *                                    (see `index.ts`)
 *   - `extractListingFromHtml(html, sourceUrl)` — Chrome-extension ingest
 *                                    seam: the user's real browser captured
 *                                    the HTML; no fetch happens here.
 *
 * Pipeline (unchanged from the merged Days 3-6 orchestration):
 *   JSON-LD → OG merge → invalid-numeric scrub → DOM escalation →
 *   LLM rare path → normalizeFields → extraction_method / confidence.
 *
 * SECURITY / TRUST MODEL: this module never applies the fetch path's
 * `BLOCK_SIGNALS` substring heuristic. Phase-0 (commit 905bd2e) showed legit
 * browser-served Zillow pages embed the substring "captcha" (reCAPTCHA
 * public-key config), so block detection on caller-supplied HTML is a
 * guaranteed false positive. Block detection only makes sense on server-side
 * fetch RESPONSES — it stays in `index.ts`. HTML handed to this module is
 * trusted-as-data: every field still passes the same numeric scrubbing,
 * scheme filtering, and `normalizeFields` caps as fetched HTML.
 */

import { extractFromJsonLd } from './json-ld';
import { extractFromOg } from './og';
import { normalizeFields, inRange, NUMERIC_MAX } from './normalize';
import { extractFromDom } from './dom';
import { pruneHtml } from './prune-html';
import { createLlmExtractor } from './llm-parse';
import { extractZillowFloorPlans, isZillowBuildingUrl } from './sites/zillow';
import {
  ExtractionError,
  type ExtractedFields,
  type ExtractedListing,
  type ExtractionMethod,
  type LlmExtractor,
} from './types';

/**
 * Hard cap on the HTML byte size the FETCH path accepts. `index.ts` enforces
 * it while streaming the fetch response body (as `MAX_BODY_BYTES`). 5MB is a
 * generous budget that still defends against memory blow-up.
 *
 * The HTML seam (`extractListingFromHtml`) has its OWN, tighter cap —
 * `MAX_SEAM_HTML_BYTES` below — so the two entry points can be tuned
 * independently.
 */
export const MAX_HTML_BYTES = 5 * 1024 * 1024;

/**
 * Hard cap on caller-supplied HTML at the `extractListingFromHtml` seam
 * (review fix, security LOW). Listing pages are typically <2MB even with
 * inline SVGs and base64-encoded hero images, but the largest real
 * browser-captured fixture (zillow-madison-building.html, a /apartments/
 * page) is 3.47MB — 4MB is the smallest power-of-two bound that fits real
 * captures comfortably while shaving 20% off the fetch path's budget.
 */
export const MAX_SEAM_HTML_BYTES = 4 * 1024 * 1024;

/**
 * Cap on the `sourceUrl` string accepted by `extractListingFromHtml`
 * (review fix, security LOW). Browsers and CDNs conventionally cap URLs
 * around 2KB; anything longer is not a real listing URL and only bloats
 * stored `source_url` values and error context.
 */
export const MAX_SOURCE_URL_CHARS = 2048;

/**
 * Options accepted by the pure pipeline. Only the LLM rare path is
 * injectable — fetch-related options (`fetcher`, `timeoutMs`, `userAgent`,
 * `lookup`) belong to the URL entry point in `index.ts`.
 */
export interface ExtractListingFromHtmlOptions {
  /**
   * Override the LLM-clean rare path. Tests inject a stub so no network call
   * is made; production lazily constructs the real Gemini-backed extractor
   * when escalation is warranted and credentials exist.
   */
  llmExtractor?: LlmExtractor;
  /**
   * Full page visible text (document.body.innerText from the browser).
   * Appended to the LLM rare-path context when structured passes miss key fields.
   * Cap: 200k chars (enforced at the route boundary; silently truncated here).
   */
  innerText?: string;
  /**
   * Same-origin iframe HTML fragments captured by the extension.
   * Each is run through extractFromJsonLd + extractFromOg and the results
   * are fill-gap merged after the main page's Pass 1. Cross-origin iframes
   * are unreadable from the page — the deep-extract mission covers those.
   * Cap: 10 iframes, 524288 chars each (enforced at the route boundary).
   */
  iframes?: ReadonlyArray<{ readonly src: string; readonly html: string }>;
}

/**
 * Internal pipeline options. `sourceUrl` lets the URL entry point report the
 * URL the user supplied (pre-redirect) while resolving relative asset URLs
 * against `finalUrl` (post-redirect).
 */
interface PipelineOptions extends ExtractListingFromHtmlOptions {
  /** URL reported as `source_url` and in error messages. Defaults to `finalUrl`. */
  sourceUrl?: string;
}

/** Cap on innerText chars sent to the LLM context. */
const MAX_INNER_TEXT_LLM_CHARS = 30_000;
/** Cap on per-iframe HTML (chars) for pruneHtml processing in LLM context. */
const MAX_IFRAME_LLM_CHARS = 8_000;

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
 * since callers validate the URL first).
 */
export function deriveSourceDomain(url: string): string {
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
  // — debug aid, plus the LLM-clean rare path may re-parse it.
  if (og.hasAnyOgData) {
    merged.raw_og = og.raw_og;
  }

  return { merged, ogContributed };
}

/**
 * Which extraction layers contributed at least one field to the merged result.
 * Built in the pipeline and consumed by both `deriveExtractionMethod` (to
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
 * subsequence). The pipeline guarantees the set is non-empty before calling
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
function llmPathAvailable(opts: ExtractListingFromHtmlOptions): boolean {
  if (opts.llmExtractor) return true;
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_PROJECT);
}

/**
 * The shared post-fetch pipeline. Pure with respect to the network: no fetch,
 * no SSRF checks, no block-signal heuristics — callers own transport-level
 * concerns. Both `extractListing` (after fetching) and
 * `extractListingFromHtml` (extension-captured HTML) call this.
 *
 * @param html     Raw page HTML.
 * @param finalUrl URL the HTML was actually served from. Base for relative
 *                 asset resolution and the Layer-3 per-site DOM dispatch.
 * @param opts     LLM injection + optional `sourceUrl` override (the URL
 *                 reported back as `source_url`; defaults to `finalUrl`).
 *
 * Throws `ExtractionError('no_listing_data')` when no layer produced any
 * usable field.
 */
export async function extractFromHtml(
  html: string,
  finalUrl: string,
  opts: PipelineOptions = {},
): Promise<ExtractedListing> {
  const sourceUrl = opts.sourceUrl ?? finalUrl;
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

  // ── Pass 1b: Same-origin iframe HTML (AIN-71 richer capture) ───────────
  // Run the same JSON-LD + OG pipeline on each captured iframe and fill-gaps
  // into the main merged result. Iframe data NEVER overwrites main-page data
  // (fill-gaps semantics). Iframe hits count as the existing json_ld/og layers.
  if (opts.iframes && opts.iframes.length > 0) {
    const capped = opts.iframes.slice(0, 10); // belt-and-braces: route already validates
    for (const iframe of capped) {
      // Silently truncate oversized iframe HTML — route already capped at 524288
      const iframeHtml = iframe.html.slice(0, 524_288);
      try {
        const iframeJsonLd = extractFromJsonLd(iframeHtml, iframe.src || finalUrl);
        if (iframeJsonLd !== null) {
          const iframeScrubbed = dropInvalidNumerics({ ...iframeJsonLd });
          if (fillGaps(merged, iframeScrubbed)) contributors.add('json_ld');
        }
        const iframeOg = extractFromOg(iframeHtml, iframe.src || finalUrl);
        if (fillGaps(merged, dropInvalidNumerics({ ...iframeOg.fields }))) contributors.add('og');
      } catch {
        // Malformed iframe HTML — skip silently
      }
    }
  }

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
        // Build enriched context: pruned main HTML + innerText + iframe excerpts
        let llmContext = pruneHtml(html);
        if (opts.innerText) {
          const innerTextExcerpt = opts.innerText.slice(0, MAX_INNER_TEXT_LLM_CHARS);
          llmContext = `${llmContext}\n\nVISIBLE PAGE TEXT:\n${innerTextExcerpt}`;
        }
        if (opts.iframes && opts.iframes.length > 0) {
          const iframeExcerpts = opts.iframes.slice(0, 10)
            .map((f) => pruneHtml(f.html.slice(0, 524_288)).slice(0, MAX_IFRAME_LLM_CHARS))
            .filter((e) => e.trim().length > 0);
          if (iframeExcerpts.length > 0) {
            llmContext = `${llmContext}\n\nFRAME CONTENT:\n${iframeExcerpts.join('\n---\n')}`;
          }
        }
        const llmFields = await llm(llmContext, finalUrl);
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
      `No extraction layer (JSON-LD, OpenGraph, DOM, or LLM) produced any usable fields for ${sourceUrl}`,
      sourceUrl,
    );
  }

  const extraction_method = deriveExtractionMethod(contributors);
  const extraction_confidence = computeConfidence(normalized, contributors);

  // ── Enrichment: deterministic Zillow floor-plan parse (AIN-83) ─────────
  // URL-gated and DELIBERATELY independent of the escalation ladder above:
  // a Zillow building page satisfies `hasKeyFields` via JSON-LD alone (its
  // JSON-LD carries a price + address), so Pass 2 (DOM — the layer that
  // knows how to read `building.floorPlans[]`) never runs. This reads the
  // same `html` regardless of what escalation already found, so a
  // `/homedetails/` single-unit page never pays the extra parse.
  let floor_plans: ReturnType<typeof extractZillowFloorPlans> | undefined;
  if (source_domain === 'zillow.com' && !merged.floor_plans && isZillowBuildingUrl(finalUrl)) {
    try {
      const plans = extractZillowFloorPlans(html);
      if (plans.length > 0) floor_plans = plans;
    } catch {
      // Never let floor-plan enrichment break the base extraction.
    }
  }

  return {
    source_url: sourceUrl,
    // codex P2: `source_domain` should reflect where the listing actually
    // lives, not the shortener / tracking redirector the user happened to
    // paste. Use the post-redirect URL so per-publisher logic (e.g. Zillow
    // vs Apartments.com handling in downstream tools) keys correctly. The
    // user-facing `source_url` stays as the input — that's the link they
    // care about. Computed once above (`source_domain`) so the escalation
    // DOM dispatch and the returned field key off the same value.
    source_domain,
    ...normalized,
    ...(floor_plans ? { floor_plans } : {}),
    extraction_method,
    extraction_confidence,
  };
}

/**
 * Extract a normalized `ExtractedListing` from caller-supplied HTML — the
 * Chrome-extension ingest seam (AIN-62). The extension captures
 * `document.documentElement.outerHTML` from the user's real, logged-in
 * browser session and the ingest route hands it here. No fetch happens:
 * the page already rendered for the user, so server-side block heuristics
 * (`BLOCK_SIGNALS`) deliberately do NOT apply (Phase-0 finding: legit Zillow
 * pages embed the substring "captcha" in script config).
 *
 * Validation at the boundary:
 *   - `html` must be a non-empty string no larger than `MAX_SEAM_HTML_BYTES`
 *     (4MB — tighter than the fetch path's 5MB streaming cap).
 *   - `sourceUrl` must be a valid absolute http(s) URL of at most
 *     `MAX_SOURCE_URL_CHARS` (2048) characters; `source_domain` derives
 *     from it.
 *
 * Throws `ExtractionError` with `parse_failed` on invalid input or
 * `no_listing_data` when no extraction layer produced any usable field.
 */
export async function extractListingFromHtml(
  html: string,
  sourceUrl: string,
  opts: ExtractListingFromHtmlOptions = {},
): Promise<ExtractedListing> {
  // Length-cap the URL before parsing it — keeps a multi-megabyte "URL" out
  // of `new URL` and out of the error-context field (truncated for safety).
  if (typeof sourceUrl === 'string' && sourceUrl.length > MAX_SOURCE_URL_CHARS) {
    throw new ExtractionError(
      'parse_failed',
      `sourceUrl exceeds ${MAX_SOURCE_URL_CHARS} characters (got ${sourceUrl.length})`,
      sourceUrl.slice(0, 256),
    );
  }

  // Validate the URL first — it doubles as the error-context `url` field.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch (err) {
    throw new ExtractionError('parse_failed', `Invalid URL: ${sourceUrl}`, String(sourceUrl), err);
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ExtractionError(
      'parse_failed',
      `Unsupported URL scheme: ${parsedUrl.protocol}`,
      sourceUrl,
    );
  }

  if (typeof html !== 'string' || html.trim() === '') {
    throw new ExtractionError(
      'parse_failed',
      'HTML must be a non-empty string',
      sourceUrl,
    );
  }
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_SEAM_HTML_BYTES) {
    throw new ExtractionError(
      'parse_failed',
      `HTML exceeds ${MAX_SEAM_HTML_BYTES} bytes (got ${bytes}) for ${sourceUrl}`,
      sourceUrl,
    );
  }

  // Silently truncate richer fields if they somehow exceed the caps
  // (route already validates, but defensive truncation is cheap)
  const innerText = opts.innerText !== undefined
    ? opts.innerText.slice(0, 200_000)
    : undefined;
  const iframes = opts.iframes !== undefined
    ? opts.iframes.slice(0, 10).map((f) => ({
        src: f.src.slice(0, 2048),
        html: f.html.slice(0, 524_288),
      }))
    : undefined;

  return extractFromHtml(html, sourceUrl, {
    llmExtractor: opts.llmExtractor,
    innerText,
    iframes,
  });
}
