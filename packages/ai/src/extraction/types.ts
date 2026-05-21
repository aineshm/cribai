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
  raw_json_ld?: Record<string, unknown>;
  raw_og?: Record<string, string>;
  extraction_method: 'json_ld' | 'og' | 'json_ld_plus_og';
  extraction_confidence: 'high' | 'medium' | 'low';
}

/**
 * Optional dependency injection for the entry point. Tests pass a fake
 * `fetcher` that resolves with fixture HTML; production uses the global
 * `fetch`. The signature mirrors the standard `fetch` so callers can
 * swap in any compatible implementation without an adapter.
 */
export interface ExtractListingOptions {
  fetcher?: typeof fetch;
  /** Override the fetch timeout (ms). Defaults to 10_000. */
  timeoutMs?: number;
  /** Override the user-agent. Defaults to the CribAI bot UA. */
  userAgent?: string;
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
