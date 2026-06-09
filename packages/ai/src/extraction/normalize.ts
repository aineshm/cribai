/**
 * Output normalization for extracted listings (AIN-38).
 *
 * Every value the extractor returns originates from third-party HTML — JSON-LD
 * blocks, OpenGraph meta tags, Twitter cards. The downstream `addListing`
 * tool stores this directly. Without caps, a malicious or sloppy publisher
 * can:
 *   - Pollute UI/DB with multi-megabyte description strings
 *   - Exhaust storage with thousands of photo URLs
 *   - Inject `lat: 12345`, `lng: -99999` to break map rendering
 *   - Pass garbage `availabilityStarts: "soon"` that the CRM stores raw
 *
 * This module is the single point that enforces output shape. The JSON-LD
 * and OG extractors stay focused on shape recognition; `normalizeFields`
 * applies the limits before the result leaves the package.
 */

import type { ExtractedFields } from './types';
import { assertHttpScheme, SsrfBlockedError } from './ssrf-guard';

export const LIMITS = {
  TITLE_MAX: 500,
  DESCRIPTION_MAX: 10_000,
  ADDRESS_MAX: 500,
  AMENITY_MAX: 200,
  CITY_MAX: 200,
  STATE_MAX: 100,
  ZIP_MAX: 20,
  PHOTOS_MAX: 30,
  AMENITIES_MAX: 50,
} as const;

/**
 * Upper sanity-bounds for numeric listing fields. These are not domain
 * constraints — they reject only absurd/hostile values (e.g. `1e308` from a
 * runaway model or a poisoned page) that would otherwise poison downstream
 * ranking/affordability math. Generous so no real listing is ever rejected:
 * a $10M price, 1000 beds/baths, and 10M sqft all pass.
 */
export const NUMERIC_MAX = {
  PRICE: 1e7,
  BEDROOMS: 1000,
  BATHROOMS: 1000,
  SQUARE_FEET: 1e7,
} as const;

/** True when `v` is a finite number within `[0, max]`. */
export function inRange(v: unknown, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
}

function clamp(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Keep only URLs whose scheme is `http:` / `https:`. Anything else
 * (`javascript:`, `data:`, `file:`, etc.) is dropped silently — the page
 * advertised them as photos but they can't be photos. Logging the drop is
 * out of scope for this module; the caller can re-parse `raw_json_ld` /
 * `raw_og` if it needs to know what was scrubbed.
 *
 * SECURITY (latent SSRF — see AIN-57): this is a SCHEME-only filter, not a
 * HOST filter. The retained URLs are stored verbatim in `crm_listings.photo_urls`
 * and may point at a private/link-local host (e.g. `http://169.254.169.254/...`)
 * supplied by an attacker-controlled page. That is harmless TODAY — nothing
 * server-side fetches stored photo URLs (no image proxy/thumbnailer exists). It
 * becomes live SSRF the moment any such fetcher is added: that fetcher MUST run
 * each URL through the SSRF-guarded path (`assertPublicHost`) first, or this
 * function must grow an async host check. Do not fetch a stored photo URL raw.
 */
export function filterHttpUrls(urls: readonly string[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    try {
      assertHttpScheme(u);
      out.push(u);
    } catch (err) {
      if (err instanceof SsrfBlockedError) continue;
      throw err;
    }
  }
  return out;
}

/**
 * Drop both axes when either is missing or out of range. WGS84 ranges are
 * lat ∈ [-90, 90], lng ∈ [-180, 180]; values like `12345` indicate corrupt
 * publisher data and a half-coord is worse than no coord for the map.
 */
function sanitiseGeo(
  lat: number | undefined,
  lng: number | undefined,
): { latitude?: number; longitude?: number } {
  if (lat === undefined || lng === undefined) return {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};
  if (lat < -90 || lat > 90) return {};
  if (lng < -180 || lng > 180) return {};
  return { latitude: lat, longitude: lng };
}

/**
 * Match a YYYY-MM-DD prefix at the start of the input. Captures the date
 * portion regardless of any trailing time / offset.
 */
const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Normalise an `availabilityStarts`-shaped date string into YYYY-MM-DD.
 * Returns `undefined` for unparseable input.
 *
 * Downstream validators (`tool-registry.ts`, `create-sublease.ts`) enforce
 * a strict `^\d{4}-\d{2}-\d{2}$` shape, so the extractor must clamp to
 * that contract — emitting an ISO timestamp would silently break the
 * chain for every listing that has an availability date.
 *
 * Branching by input shape avoids the UTC-shift trap:
 *
 *   - If the input already starts with `YYYY-MM-DD`, use the date prefix
 *     verbatim (after light validity check). This preserves the publisher's
 *     intended calendar date even when their full timestamp carries a
 *     wild timezone offset like "+14:00" — `toISOString()` would otherwise
 *     shift `2026-08-15T00:30:00+14:00` back to `2026-08-14` (codex round-3 P2).
 *
 *   - Otherwise we accept Date.parse-able natural-language forms
 *     ("August 15 2026 UTC"). Those don't carry a publisher-intended local
 *     calendar date, so converting via toISOString().slice(0,10) is fine.
 */
/**
 * Validate that a captured `YYYY-MM-DD` is a real calendar date. Date.parse
 * silently rolls invalid days over to the next month (`2023-02-29` →
 * 2023-03-01), so checking `Date.parse(candidate)` is finite isn't enough.
 * We round-trip via UTC components and confirm they match the captured
 * digits before accepting.
 */
function isRealCalendarDate(candidate: string): boolean {
  const parts = candidate.split('-');
  if (parts.length !== 3) return false;
  const [yy, mm, dd] = parts;
  if (!yy || !mm || !dd) return false;
  const year = Number(yy);
  const month = Number(mm);
  const day = Number(dd);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Date constructor uses local time but we only need it to detect rollover.
  // Use UTC explicitly so the comparison is deterministic.
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function normaliseAvailableFrom(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const datePrefix = ISO_DATE_PREFIX.exec(raw);
  if (datePrefix) {
    const candidate = datePrefix[1]!;
    if (!isRealCalendarDate(candidate)) return undefined;
    return candidate;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Apply every output-shape rule to an `ExtractedFields` map. Returns a NEW
 * object — never mutates `fields`. Fields that fail validation are dropped
 * entirely (rather than coerced); a downstream tool would rather see
 * `undefined` than a corrupted value.
 */
export function normalizeFields(fields: ExtractedFields): ExtractedFields {
  const out: ExtractedFields = {};

  const title = clamp(fields.title, LIMITS.TITLE_MAX);
  if (title) out.title = title;

  const description = clamp(fields.description, LIMITS.DESCRIPTION_MAX);
  if (description) out.description = description;

  // Numeric fields are dropped unless finite AND within [0, sane-max]. Rent,
  // bed/bath counts, and square footage are physically non-negative AND bounded;
  // a negative value is corrupt publisher data / a sloppy labeled-DOM parse
  // ("-2 beds") / a misbehaving model (AIN-47 Layer 4 returns model JSON
  // pre-normalize), and an absurd value (e.g. `1e308` from a hostile page or a
  // runaway model) would otherwise poison downstream ranking/affordability math
  // (`rank-compare`, `infer-profile`) — the columns are `numeric` so the DB
  // wouldn't reject it. A half-valid out-of-range number is worse than
  // `undefined` for `addListing`, so drop it (mirrors the geo/date drop rule).
  if (inRange(fields.price, NUMERIC_MAX.PRICE)) out.price = fields.price as number;
  if (inRange(fields.bedrooms, NUMERIC_MAX.BEDROOMS)) out.bedrooms = fields.bedrooms as number;
  if (inRange(fields.bathrooms, NUMERIC_MAX.BATHROOMS)) out.bathrooms = fields.bathrooms as number;
  if (inRange(fields.square_feet, NUMERIC_MAX.SQUARE_FEET)) out.square_feet = fields.square_feet as number;

  const address = clamp(fields.address, LIMITS.ADDRESS_MAX);
  if (address) out.address = address;
  const city = clamp(fields.city, LIMITS.CITY_MAX);
  if (city) out.city = city;
  const state = clamp(fields.state, LIMITS.STATE_MAX);
  if (state) out.state = state;
  const zip = clamp(fields.zip, LIMITS.ZIP_MAX);
  if (zip) out.zip = zip;

  const geo = sanitiseGeo(fields.latitude, fields.longitude);
  if (geo.latitude !== undefined) out.latitude = geo.latitude;
  if (geo.longitude !== undefined) out.longitude = geo.longitude;

  if (fields.photos && fields.photos.length > 0) {
    const cleaned = filterHttpUrls(fields.photos).slice(0, LIMITS.PHOTOS_MAX);
    if (cleaned.length > 0) out.photos = cleaned;
  }

  if (fields.amenities && fields.amenities.length > 0) {
    const cleaned = fields.amenities
      .map((a) => clamp(a, LIMITS.AMENITY_MAX))
      .filter((a): a is string => typeof a === 'string' && a.length > 0)
      .slice(0, LIMITS.AMENITIES_MAX);
    if (cleaned.length > 0) out.amenities = cleaned;
  }

  const available_from = normaliseAvailableFrom(fields.available_from);
  if (available_from) out.available_from = available_from;

  if (fields.raw_json_ld) out.raw_json_ld = fields.raw_json_ld;
  if (fields.raw_og) out.raw_og = fields.raw_og;

  return out;
}
