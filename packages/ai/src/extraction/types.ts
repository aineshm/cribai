/**
 * Public type contract for the listing extraction service (AIN-13).
 *
 * The extractor takes a URL to an external listing (Zillow, Apartments.com,
 * Realtor, etc.) and returns a normalized `ExtractedListing` shape. This is
 * the input to the Track C `addListing` tool, which is what writes into the
 * `crm_listings` table. Nothing in this module touches the database.
 *
 * Day 3-4 covers JSON-LD (primary) and OpenGraph (fallback) extraction.
 * Day 5 will add DOM-fallback extractors for sites where the structured-data
 * paths fall short. Day 6 will add the LLM-clean rare path.
 */

import type { FloorPlan } from './floor-plan';
import type { RawSelectedUnit } from './selected-unit';

export type { FloorPlan } from './floor-plan';
export type { RawSelectedUnit } from './selected-unit';

/**
 * The normalized listing shape returned by `extractListing`.
 *
 * Notes:
 *  - `price` is monthly rent in USD. Weekly / yearly normalization is the
 *    responsibility of the caller (Track C `addListing`), not this module.
 *  - `photos` are absolute URLs (relative URLs are resolved against the
 *    source URL during extraction).
 *  - `raw_json_ld` and `raw_og` are preserved for debugging and so the
 *    Day 6 LLM-clean rare path can re-parse later without re-fetching.
 *  - `extraction_confidence` is a coarse string enum on purpose. The
 *    `crm_listings.extraction_confidence` numeric column accepts a 0..1
 *    score; the `addListing` tool is responsible for the string→numeric
 *    mapping. This module deliberately does not write to the DB.
 *  - `floor_plans` (AIN-83) is populated ONLY by the deterministic Zillow
 *    building-page enrichment pass (`extractZillowFloorPlans`, URL-gated in
 *    `extract-from-html.ts`, independent of the JSON-LD/OG/DOM/LLM
 *    escalation ladder above). Absent everywhere else.
 *  - `selected_unit` (AIN-98) is populated ONLY when a Zillow building-page
 *    URL carries a `#udp-<zpid>` fragment matching a real unit
 *    (`resolveZillowUnit`, URL-gated the same way as `floor_plans`, gated
 *    independently of it). `addListing` stamps `viewed_at` and accumulates
 *    it into `crm_listings.raw_extraction.deep_extract.units_of_interest`.
 *    Absent everywhere else (no fragment, no match, non-Zillow, single-unit
 *    page).
 */
export interface ExtractedListing {
  source_url: string;
  source_domain: string;
  title?: string;
  description?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  square_feet?: number;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  photos?: string[];
  amenities?: string[];
  available_from?: string;
  floor_plans?: FloorPlan[];
  selected_unit?: RawSelectedUnit;
  raw_json_ld?: Record<string, unknown>;
  raw_og?: Record<string, string>;
  extraction_method: ExtractionMethod;
  extraction_confidence: 'high' | 'medium' | 'low';
}

/**
 * Which extractor(s) contributed to the result. Day 3-4 produced only the
 * JSON-LD / OG combinations; Day 5 adds a DOM-fallback extractor and Day 6
 * adds the LLM-clean rare path, so the union now covers every combination of
 * the four contributors.
 *
 * Task 3 derives these mechanically: it joins the set of contributing
 * extractors with `_plus_` in a FIXED precedence order — `json_ld` > `og` >
 * `dom` > `llm`. This type exhaustively enumerates the reachable combinations
 * so that derivation is fully type-checked. (A bare `og_plus_dom` with no
 * JSON-LD is reachable, as is `dom` or `llm` alone, etc.)
 */
export type ExtractionMethod =
  // single-source
  | 'json_ld'
  | 'og'
  | 'dom'
  | 'llm'
  // two-source
  | 'json_ld_plus_og'
  | 'json_ld_plus_dom'
  | 'og_plus_dom'
  | 'json_ld_plus_llm'
  | 'og_plus_llm'
  | 'dom_plus_llm'
  // three-source
  | 'json_ld_plus_og_plus_dom'
  | 'json_ld_plus_og_plus_llm'
  | 'json_ld_plus_dom_plus_llm'
  | 'og_plus_dom_plus_llm'
  // all four
  | 'json_ld_plus_og_plus_dom_plus_llm';

/**
 * The subset of `ExtractedListing` fields that individual extractors
 * (JSON-LD, OG) produce. The entry-point assembler is the only place that
 * assigns `source_url`, `source_domain`, `extraction_method`, and
 * `extraction_confidence`, so those four are excluded here.
 */
export type ExtractedFields = Omit<
  ExtractedListing,
  'source_url' | 'source_domain' | 'extraction_method' | 'extraction_confidence'
>;

/**
 * The LLM-clean rare path (Day 6). Given pruned page text and the source URL,
 * returns the subset of fields the model could confidently extract. It is a
 * best-effort fallback: it NEVER throws and returns `{}` when it can't parse a
 * listing. The returned fields are RAW (un-normalized) — the entry point runs
 * `normalizeFields` on the merged result.
 *
 * Production constructs the real Gemini-backed implementation lazily in
 * `index.ts`; tests inject a stub via `ExtractListingOptions.llmExtractor`.
 */
export type LlmExtractor = (
  prunedHtml: string,
  sourceUrl: string,
) => Promise<Partial<ExtractedFields>>;

/**
 * Lookup signature accepted by the SSRF guard. Mirrors the subset of
 * `dnsPromises.lookup({all:true})` we need so tests can stub DNS without
 * importing the helper module.
 */
export type DnsLookupOption = (
  host: string,
  options: { all: true },
) => Promise<{ address: string; family: 4 | 6 }[]>;

/**
 * Optional dependency injection for the entry point. Tests pass a fake
 * `fetcher` that resolves with fixture HTML; production uses the global
 * `fetch`. The signature mirrors the standard `fetch` so callers can
 * swap in any compatible implementation without an adapter.
 *
 * `lookup` is injected by tests that need to simulate DNS rebinding — e.g.
 * "this public hostname resolves to 169.254.169.254". Production uses the
 * default `dns.promises.lookup`.
 */
export interface ExtractListingOptions {
  fetcher?: typeof fetch;
  /** Override the fetch timeout (ms). Defaults to 10_000. */
  timeoutMs?: number;
  /** Override the user-agent. Defaults to the CribAI bot UA. */
  userAgent?: string;
  /** Override DNS resolution (tests only). */
  lookup?: DnsLookupOption;
  /**
   * Override the LLM-clean rare path (Day 6). Tests inject a stub so no
   * network call is made; in production the entry point lazily constructs the
   * real Gemini-backed extractor (`createLlmExtractor`) when escalation is
   * warranted. When omitted, the LLM path is simply not run.
   */
  llmExtractor?: LlmExtractor;
}

/**
 * Error codes surfaced by `ExtractionError`. The caller (Track C tool)
 * decides whether to retry, fall back to LLM-clean, or surface to the user.
 */
export type ExtractionErrorCode =
  | 'fetch_failed'
  | 'fetch_blocked'
  | 'parse_failed'
  | 'no_listing_data';

/**
 * Typed error thrown by `extractListing`. Always carries a `code` so the
 * caller can branch without parsing the message.
 */
export class ExtractionError extends Error {
  readonly code: ExtractionErrorCode;
  readonly url: string;
  readonly cause?: unknown;

  constructor(code: ExtractionErrorCode, message: string, url: string, cause?: unknown) {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
    this.url = url;
    this.cause = cause;
  }
}
