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
 * Normalise an `availabilityStarts`-shaped date string into ISO 8601. Returns
 * `undefined` for unparseable input. `Date.parse` is permissive (accepts
 * "2026-08-15", "August 15 2026", and a handful of locale forms); we keep
 * that flexibility and emit a canonical ISO string downstream.
 */
function normaliseAvailableFrom(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString();
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

  if (typeof fields.price === 'number' && Number.isFinite(fields.price)) {
    out.price = fields.price;
  }
  if (typeof fields.bedrooms === 'number' && Number.isFinite(fields.bedrooms)) {
    out.bedrooms = fields.bedrooms;
  }
  if (typeof fields.bathrooms === 'number' && Number.isFinite(fields.bathrooms)) {
    out.bathrooms = fields.bathrooms;
  }
  if (typeof fields.square_feet === 'number' && Number.isFinite(fields.square_feet)) {
    out.square_feet = fields.square_feet;
  }

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
