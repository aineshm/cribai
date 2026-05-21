/**
 * JSON-LD extraction for real-estate listings.
 *
 * Parses every `<script type="application/ld+json">` block in the HTML and
 * picks the first entity whose `@type` looks like a listing. Supports the
 * common Schema.org shapes seen on Zillow, Apartments.com, Realtor, Trulia,
 * and Facebook Marketplace:
 *
 *   - `RealEstateListing`, `Apartment`, `House`, `Residence`,
 *     `SingleFamilyResidence`, `Place`, `Product`
 *   - `@graph` arrays containing one of the above
 *   - Multiple `<script>` blocks per page (BreadcrumbList, Organization, then
 *     the listing) — all are inspected
 *
 * No HTML parser is intentionally introduced here — regex on the well-defined
 * `<script type="application/ld+json">…</script>` shape is sufficient and
 * keeps `@campusnest/ai` free of new prod deps. cheerio is used elsewhere in
 * the monorepo but is not currently a dep of this package.
 *
 * Note on entity decoding: JSON-LD strings are JSON text, not HTML attribute
 * text. We intentionally preserve them verbatim (no `&amp;` → `&` substitution).
 * Some CMS-driven sites round-trip HTML-encoded copy through JSON-LD; if that
 * becomes a problem in practice, the consumer (Track C `addListing`) is the
 * right layer to normalize on write. The OpenGraph extractor DOES decode
 * entities because `meta content=""` is HTML-attribute context.
 */

import type { ExtractedListing } from './types';

const LISTING_TYPES: ReadonlySet<string> = new Set([
  'RealEstateListing',
  'Apartment',
  'House',
  'Residence',
  'SingleFamilyResidence',
  'Place',
  'Product',
  // Variations seen in the wild
  'ApartmentComplex',
  'ResidentialApartmentComplex',
]);

const SCRIPT_TAG_REGEX =
  /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Parse all JSON-LD blocks from raw HTML. Malformed blocks are skipped
 * silently — the goal is to extract whatever structured data is valid,
 * not to validate the whole page.
 */
export function parseAllJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const matches = html.matchAll(SCRIPT_TAG_REGEX);
  for (const match of matches) {
    const body = (match[1] ?? '').trim();
    if (!body) continue;
    try {
      blocks.push(JSON.parse(body));
    } catch {
      // Malformed JSON-LD — graceful degradation, the OG fallback will catch it.
    }
  }
  return blocks;
}

/**
 * Walk a JSON-LD value and emit every object that has an `@type` we recognize
 * as a listing. Handles `@graph` arrays and arbitrarily nested structures.
 */
function* findListingEntities(node: unknown): IterableIterator<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const item of node) yield* findListingEntities(item);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;

  const type = obj['@type'];
  const types: string[] = Array.isArray(type)
    ? type.filter((t): t is string => typeof t === 'string')
    : typeof type === 'string'
      ? [type]
      : [];
  if (types.some((t) => LISTING_TYPES.has(t))) {
    yield obj;
  }

  // Recurse into every property of the object so we also pick up listings
  // nested under containers like `WebPage.mainEntity`, `ItemList.itemListElement`,
  // or vendor-specific wrappers. `@graph` is included by this generic walk.
  // Schema.org / JSON-LD context keys (those starting with '@') are skipped
  // to avoid pathological traversals of `@context` definitions.
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('@') && key !== '@graph') continue;
    if (value && (typeof value === 'object' || Array.isArray(value))) {
      yield* findListingEntities(value);
    }
  }
}

/**
 * Coerce a value to a number when possible. Handles strings like "$1,950",
 * "1950 USD", and numeric values. Ranged strings like "$1,800 - $2,200" are
 * collapsed to the lower bound (the most useful value for filtering) and
 * a debug breadcrumb is preserved in `raw_json_ld` for the caller. Returns
 * undefined on failure.
 */
function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;

  // Detect a range like "1,800 - 2,200" or "$1800–$2200" (en-dash). The first
  // numeric token wins — multi-unit pages publish low–high; the low bound is
  // what students filter by.
  const tokens = value.match(/-?\d[\d,]*(?:\.\d+)?/g);
  if (tokens && tokens.length > 0) {
    const first = tokens[0]!.replace(/,/g, '');
    const parsed = Number(first);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Extract price from any of the JSON-LD shapes seen in the wild.
 * `offers` and `priceSpecification` may be objects or arrays.
 */
function extractPrice(entity: Record<string, unknown>): number | undefined {
  // Direct price (uncommon but seen on Product variants)
  const direct = toNumber(entity.price);
  if (direct !== undefined) return direct;

  const offers = entity.offers;
  const offersList: unknown[] = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const offer of offersList) {
    if (!offer || typeof offer !== 'object') continue;
    const o = offer as Record<string, unknown>;
    const offerPrice = toNumber(o.price);
    if (offerPrice !== undefined) return offerPrice;
    const spec = o.priceSpecification;
    const specList: unknown[] = Array.isArray(spec) ? spec : spec ? [spec] : [];
    for (const s of specList) {
      if (!s || typeof s !== 'object') continue;
      const sp = s as Record<string, unknown>;
      const specPrice = toNumber(sp.price);
      if (specPrice !== undefined) return specPrice;
    }
  }

  const ps = entity.priceSpecification;
  const psList: unknown[] = Array.isArray(ps) ? ps : ps ? [ps] : [];
  for (const s of psList) {
    if (!s || typeof s !== 'object') continue;
    const sp = s as Record<string, unknown>;
    const specPrice = toNumber(sp.price);
    if (specPrice !== undefined) return specPrice;
  }

  return undefined;
}

/**
 * floorSize can be `{value, unitCode}`, `{value, unitText}`, or a bare number.
 * Convert square meters to square feet when unit suggests metric.
 */
function extractSquareFeet(entity: Record<string, unknown>): number | undefined {
  const fs = entity.floorSize;
  if (fs === undefined || fs === null) return undefined;
  if (typeof fs === 'number') return fs;
  if (typeof fs === 'object') {
    const obj = fs as Record<string, unknown>;
    const value = toNumber(obj.value);
    if (value === undefined) return undefined;
    const unitCode = typeof obj.unitCode === 'string' ? obj.unitCode.toUpperCase() : '';
    const unitText = typeof obj.unitText === 'string' ? obj.unitText.toLowerCase() : '';
    // MTK = square meters (UN/CEFACT). FTK / SQFT / "square feet" are square feet.
    if (unitCode === 'MTK' || unitText.includes('meter') || unitText.includes('metre')) {
      return Math.round(value * 10.7639);
    }
    return Math.round(value);
  }
  return undefined;
}

/**
 * Extract a string value from either a plain string field or the first
 * element of an array. Returns undefined when neither shape applies.
 */
function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = firstString(v);
      if (s !== undefined) return s;
    }
  }
  return undefined;
}

/**
 * Resolve a possibly-relative image URL against the source page URL.
 * Returns undefined if resolution fails.
 */
function resolveUrl(maybeRelative: string, base: string): string | undefined {
  try {
    return new URL(maybeRelative, base).href;
  } catch {
    return undefined;
  }
}

/**
 * `image` may be a string, an array of strings, or an array of ImageObject.
 * All three shapes are normalized to a list of absolute URLs.
 */
function extractPhotos(entity: Record<string, unknown>, sourceUrl: string): string[] {
  const image = entity.image;
  const urls: string[] = [];
  const pushImage = (val: unknown): void => {
    if (typeof val === 'string') {
      const resolved = resolveUrl(val, sourceUrl);
      if (resolved) urls.push(resolved);
    } else if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      const candidate =
        typeof obj.url === 'string'
          ? obj.url
          : typeof obj.contentUrl === 'string'
            ? obj.contentUrl
            : undefined;
      if (candidate) {
        const resolved = resolveUrl(candidate, sourceUrl);
        if (resolved) urls.push(resolved);
      }
    }
  };
  if (Array.isArray(image)) image.forEach(pushImage);
  else pushImage(image);
  // Dedupe while preserving order
  return Array.from(new Set(urls));
}

/**
 * Extract amenities from `amenityFeature` (Schema.org standard) or
 * `additionalProperty`. Each entry is a `LocationFeatureSpecification`
 * with a `name`; we keep entries whose value is truthy (the spec uses
 * a boolean `value` to indicate presence).
 */
function extractAmenities(entity: Record<string, unknown>): string[] {
  const features: string[] = [];
  const sources: unknown[] = [];
  if (entity.amenityFeature) sources.push(entity.amenityFeature);
  if (entity.additionalProperty) sources.push(entity.additionalProperty);

  for (const src of sources) {
    const list: unknown[] = Array.isArray(src) ? src : [src];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const name = firstString(obj.name);
      if (!name) continue;
      // If `value` is explicitly false, skip — the spec uses it to indicate absence.
      if (obj.value === false) continue;
      features.push(name);
    }
  }
  return Array.from(new Set(features));
}

/**
 * Address may be a nested PostalAddress object or a flat string.
 * Returns the components we can recover.
 */
function extractAddress(entity: Record<string, unknown>): {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
} {
  const a = entity.address;
  if (!a) return {};
  if (typeof a === 'string') {
    return { address: a.trim() };
  }
  if (typeof a !== 'object') return {};

  // Some sources nest an array of PostalAddress; take the first.
  const first = Array.isArray(a) ? (a[0] as unknown) : a;
  if (!first || typeof first !== 'object') return {};
  const obj = first as Record<string, unknown>;

  const street = firstString(obj.streetAddress);
  const city = firstString(obj.addressLocality);
  const state = firstString(obj.addressRegion);
  const zip = firstString(obj.postalCode);

  return {
    address: street,
    city,
    state,
    zip,
  };
}

/**
 * `geo` may be `{latitude, longitude}` (numbers or numeric strings) or a
 * `GeoCoordinates` object. Returns undefined when both axes can't be read.
 */
function extractGeo(entity: Record<string, unknown>): {
  latitude?: number;
  longitude?: number;
} {
  const geo = entity.geo;
  if (!geo || typeof geo !== 'object') return {};
  const g = (Array.isArray(geo) ? geo[0] : geo) as Record<string, unknown> | undefined;
  if (!g || typeof g !== 'object') return {};
  const lat = toNumber(g.latitude);
  const lng = toNumber(g.longitude);
  if (lat === undefined || lng === undefined) return {};
  return { latitude: lat, longitude: lng };
}

/**
 * Schema.org uses several keys for bedroom count depending on the type:
 *   - `numberOfBedrooms` (Residence, Apartment)
 *   - `numberOfRooms` (House, SingleFamilyResidence)
 *   - `numberOfBedrooms` may be `{value, unitText}` on some sites
 */
function extractBedrooms(entity: Record<string, unknown>): number | undefined {
  const candidates: unknown[] = [
    entity.numberOfBedrooms,
    entity.numberOfRooms,
  ];
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const direct = toNumber(c);
    if (direct !== undefined) return direct;
    if (typeof c === 'object') {
      const v = toNumber((c as Record<string, unknown>).value);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

function extractBathrooms(entity: Record<string, unknown>): number | undefined {
  const candidates: unknown[] = [
    entity.numberOfBathroomsTotal,
    entity.numberOfBathrooms,
    entity.numberOfFullBathrooms, // partial — at least the full count
  ];
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const direct = toNumber(c);
    if (direct !== undefined) return direct;
    if (typeof c === 'object') {
      const v = toNumber((c as Record<string, unknown>).value);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

/**
 * Project a single JSON-LD entity into the `ExtractedListing` shape.
 * The returned object excludes `source_url`, `source_domain`,
 * `extraction_method`, and `extraction_confidence` — those are assigned
 * by the entry-point assembler.
 */
export function projectJsonLdEntity(
  entity: Record<string, unknown>,
  sourceUrl: string,
): Omit<ExtractedListing, 'source_url' | 'source_domain' | 'extraction_method' | 'extraction_confidence'> & {
  raw_json_ld: Record<string, unknown>;
} {
  const title = firstString(entity.name);
  const description = firstString(entity.description);
  const price = extractPrice(entity);
  const bedrooms = extractBedrooms(entity);
  const bathrooms = extractBathrooms(entity);
  const square_feet = extractSquareFeet(entity);
  const { address, city, state, zip } = extractAddress(entity);
  const { latitude, longitude } = extractGeo(entity);
  const photos = extractPhotos(entity, sourceUrl);
  const amenities = extractAmenities(entity);
  // Only `availabilityStarts` maps to `available_from`. `datePosted` is the
  // ad publication date — different semantic; using it would tell users an
  // old listing is "available from" a date in the past.
  const available_from = firstString(entity.availabilityStarts);

  const result: ReturnType<typeof projectJsonLdEntity> = {
    raw_json_ld: entity,
  };
  if (title) result.title = title;
  if (description) result.description = description;
  if (price !== undefined) result.price = price;
  if (bedrooms !== undefined) result.bedrooms = bedrooms;
  if (bathrooms !== undefined) result.bathrooms = bathrooms;
  if (square_feet !== undefined) result.square_feet = square_feet;
  if (address) result.address = address;
  if (city) result.city = city;
  if (state) result.state = state;
  if (zip) result.zip = zip;
  if (latitude !== undefined) result.latitude = latitude;
  if (longitude !== undefined) result.longitude = longitude;
  if (photos.length > 0) result.photos = photos;
  if (amenities.length > 0) result.amenities = amenities;
  if (available_from) result.available_from = available_from;
  return result;
}

/**
 * Top-level helper: parse the HTML, find the first matching listing entity,
 * and project it. Returns `null` when no listing-shaped JSON-LD is found,
 * letting the caller fall through to the OpenGraph extractor.
 */
export function extractFromJsonLd(
  html: string,
  sourceUrl: string,
): ReturnType<typeof projectJsonLdEntity> | null {
  const blocks = parseAllJsonLdBlocks(html);
  for (const block of blocks) {
    for (const entity of findListingEntities(block)) {
      return projectJsonLdEntity(entity, sourceUrl);
    }
  }
  return null;
}
