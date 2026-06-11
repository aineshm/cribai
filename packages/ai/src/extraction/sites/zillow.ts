/**
 * Zillow Layer-3 DOM extractor (AIN-47, upgraded for real page shapes in
 * AIN-62).
 *
 * Primary path: the `__NEXT_DATA__` blob, which on real Zillow pages comes in
 * three shapes (checked in order):
 *
 *   1. LEGACY: `props.pageProps.componentProps.property` — kept for older
 *      captures and the original fixture suite.
 *   2. SINGLE-UNIT /homedetails/: `componentProps.gdpClientCache` — a JSON
 *      STRING (Apollo cache blob) keyed by GraphQL query; each value may
 *      hold a `property` object with price, beds, baths, `livingArea`,
 *      address parts, geo, description, and `responsivePhotos`.
 *   3. BUILDING /apartments/: `componentProps.initialReduxState.gdp.building`
 *      — buildingName, address parts, geo, description, `floorPlans[].units[]`
 *      with per-unit prices, and `galleryPhotos[].mixedSources`.
 *
 * Secondary path: labeled-DOM regex (`data-testid="price"` text like
 * "$1,950/mo", plus "N beds" / "N baths" / "X sqft" spans). The secondary path
 * only fills fields the blob didn't provide — so a blocked / SSR-stripped page
 * that still rendered the visible numbers degrades to a useful partial instead
 * of nothing.
 */

import type { ExtractedFields } from '../types';
import {
  extractNextData,
  parseLabeledNumber,
  resolvePhotoUrls,
  coerceNumber,
  coerceString,
  asObject,
  safeReviver,
  MONEY_RANGE,
  COUNT_RANGE,
} from '../dom';

/**
 * Project a Zillow `property` object (legacy `componentProps.property` or a
 * `gdpClientCache` entry — both share field names) into listing fields.
 */
function projectProperty(
  property: Record<string, unknown>,
  sourceUrl: string,
): Partial<ExtractedFields> {
  const fields: Partial<ExtractedFields> = {};
  const price = coerceNumber(property.price);
  if (price !== undefined) fields.price = price;
  const bedrooms = coerceNumber(property.bedrooms);
  if (bedrooms !== undefined) fields.bedrooms = bedrooms;
  const bathrooms = coerceNumber(property.bathrooms);
  if (bathrooms !== undefined) fields.bathrooms = bathrooms;
  const sqft = coerceNumber(property.livingArea);
  if (sqft !== undefined) fields.square_feet = sqft;
  const address = coerceString(property.streetAddress);
  if (address) fields.address = address;
  const city = coerceString(property.city);
  if (city) fields.city = city;
  const state = coerceString(property.state);
  if (state) fields.state = state;
  const zip = coerceString(property.zipcode);
  if (zip) fields.zip = zip;
  const lat = coerceNumber(property.latitude);
  const lng = coerceNumber(property.longitude);
  if (lat !== undefined && lng !== undefined) {
    fields.latitude = lat;
    fields.longitude = lng;
  }
  const description = coerceString(property.description);
  if (description) fields.description = description;

  // Photo array name differs by shape: `photos` on the legacy path,
  // `responsivePhotos` in gdpClientCache. Both are arrays of `{url}`.
  const rawPhotos = Array.isArray(property.photos)
    ? property.photos
    : Array.isArray(property.responsivePhotos)
      ? property.responsivePhotos
      : [];
  const urls = rawPhotos
    .map((p) => coerceString(asObject(p)?.url))
    .filter((u): u is string => typeof u === 'string');
  const photos = resolvePhotoUrls(urls, sourceUrl);
  if (photos) fields.photos = photos;

  return fields;
}

/**
 * Pull the listing `property` object out of `componentProps.gdpClientCache`
 * (AIN-62). The cache is serialized as a JSON STRING whose keys are GraphQL
 * query signatures — the values are scanned in order and the first one
 * carrying a `property` object wins. Returns `undefined` when the cache is
 * absent, unparseable, or property-less. Never throws.
 */
function propertyFromGdpClientCache(
  componentProps: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const raw = componentProps.gdpClientCache;
  let cache: Record<string, unknown> | undefined;
  if (typeof raw === 'string') {
    try {
      cache = asObject(JSON.parse(raw, safeReviver));
    } catch {
      return undefined;
    }
  } else {
    cache = asObject(raw);
  }
  if (!cache) return undefined;

  for (const entry of Object.values(cache)) {
    const property = asObject(asObject(entry)?.property);
    if (property) return property;
  }
  return undefined;
}

/**
 * Minimum price across every floorplan unit — the "from" price a student
 * filters by (mirrors the AggregateOffer low-bound rule in json-ld.ts).
 * Reads `floorPlans[].minPrice` and `floorPlans[].units[].price` /
 * `baseRent`; returns `undefined` when no unit carries a usable number.
 */
function minFloorPlanPrice(building: Record<string, unknown>): number | undefined {
  const floorPlans = Array.isArray(building.floorPlans) ? building.floorPlans : [];
  let min: number | undefined;
  const consider = (value: unknown): void => {
    const n = coerceNumber(value);
    if (n !== undefined && n > 0 && (min === undefined || n < min)) min = n;
  };
  for (const plan of floorPlans) {
    const p = asObject(plan);
    if (!p) continue;
    consider(p.minPrice);
    const units = Array.isArray(p.units) ? p.units : [];
    for (const unit of units) {
      const u = asObject(unit);
      if (!u) continue;
      consider(u.price);
      consider(u.baseRent);
    }
  }
  return min;
}

/**
 * One representative URL per gallery photo: the first `jpeg` rendition,
 * falling back to the first `webp`. (Each `mixedSources` list is the same
 * image at increasing widths — taking one per photo avoids 5x duplicates.)
 */
function galleryPhotoUrls(building: Record<string, unknown>): string[] {
  const gallery = Array.isArray(building.galleryPhotos) ? building.galleryPhotos : [];
  const urls: string[] = [];
  for (const photo of gallery) {
    const sources = asObject(asObject(photo)?.mixedSources);
    if (!sources) continue;
    const renditions = Array.isArray(sources.jpeg)
      ? sources.jpeg
      : Array.isArray(sources.webp)
        ? sources.webp
        : [];
    const url = coerceString(asObject(renditions[0])?.url);
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * Project `componentProps.initialReduxState.gdp.building` (AIN-62) into
 * listing fields. Building-level bedrooms/bathrooms are deliberately NOT
 * projected — a building spans many floorplans (0-2+ beds) and a single
 * number would mislabel it; the labeled-DOM pass or downstream layers may
 * still fill those.
 */
function projectBuilding(
  building: Record<string, unknown>,
  sourceUrl: string,
): Partial<ExtractedFields> {
  const fields: Partial<ExtractedFields> = {};

  const title = coerceString(building.buildingName);
  if (title) fields.title = title;

  const addressObj = asObject(building.address);
  const address = coerceString(addressObj?.streetAddress) ?? coerceString(building.streetAddress);
  if (address) fields.address = address;
  const city = coerceString(addressObj?.city) ?? coerceString(building.city);
  if (city) fields.city = city;
  const state = coerceString(addressObj?.state) ?? coerceString(building.state);
  if (state) fields.state = state;
  const zip = coerceString(addressObj?.zipcode) ?? coerceString(building.zipcode);
  if (zip) fields.zip = zip;

  const lat = coerceNumber(building.latitude);
  const lng = coerceNumber(building.longitude);
  if (lat !== undefined && lng !== undefined) {
    fields.latitude = lat;
    fields.longitude = lng;
  }

  const description = coerceString(building.description);
  if (description) fields.description = description;

  const price = minFloorPlanPrice(building);
  if (price !== undefined) fields.price = price;

  const photos = resolvePhotoUrls(galleryPhotoUrls(building), sourceUrl);
  if (photos) fields.photos = photos;

  return fields;
}

/**
 * Try the three `__NEXT_DATA__` shapes in order: legacy property →
 * gdpClientCache property → redux building. Returns `{}` when none match.
 */
function fromNextData(html: string, sourceUrl: string): Partial<ExtractedFields> {
  const data = asObject(extractNextData(html));
  const pageProps = asObject(asObject(data?.props)?.pageProps);
  const componentProps = asObject(pageProps?.componentProps);
  if (!componentProps) return {};

  const property =
    asObject(componentProps.property) ?? propertyFromGdpClientCache(componentProps);
  if (property) return projectProperty(property, sourceUrl);

  const building = asObject(asObject(asObject(componentProps.initialReduxState)?.gdp)?.building);
  if (building) return projectBuilding(building, sourceUrl);

  return {};
}

function fromLabeledDom(html: string): Partial<ExtractedFields> {
  const fields: Partial<ExtractedFields> = {};
  const price = parseLabeledNumber(
    new RegExp(`data-testid=["']price["'][^>]*>\\s*${MONEY_RANGE}\\s*\\/?\\s*mo`, 'i').exec(html)?.[1],
  );
  if (price !== undefined) fields.price = price;
  // A range like "2-3 beds" resolves to the LOW bound (2) via parseLabeledNumber.
  // "Studio" is intentionally NOT mapped to 0 beds here — left for gap-fill/LLM.
  const beds = parseLabeledNumber(new RegExp(`${COUNT_RANGE}\\s*beds?\\b`, 'i').exec(html)?.[1]);
  if (beds !== undefined) fields.bedrooms = beds;
  const baths = parseLabeledNumber(new RegExp(`${COUNT_RANGE}\\s*baths?\\b`, 'i').exec(html)?.[1]);
  if (baths !== undefined) fields.bathrooms = baths;
  const sqft = parseLabeledNumber(new RegExp(`${MONEY_RANGE}\\s*sqft\\b`, 'i').exec(html)?.[1]);
  if (sqft !== undefined) fields.square_feet = sqft;
  return fields;
}

export const extractZillow = (html: string, sourceUrl: string): Partial<ExtractedFields> => {
  const blob = fromNextData(html, sourceUrl);
  const dom = fromLabeledDom(html);
  // Blob wins; DOM fills gaps (gap-fill semantics).
  return { ...dom, ...blob };
};
