/**
 * Zillow Layer-3 DOM extractor (AIN-47).
 *
 * Primary path: the `__NEXT_DATA__` blob. Zillow's listing object lives under
 * `props.pageProps.componentProps.property` and carries price, beds, baths,
 * `livingArea` (sqft), the address parts, geo, description, and a `photos`
 * array of `{url}` objects.
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
  MONEY_RANGE,
  COUNT_RANGE,
} from '../dom';

function fromNextData(html: string, sourceUrl: string): Partial<ExtractedFields> {
  const data = extractNextData(html) as
    | { props?: { pageProps?: { componentProps?: { property?: Record<string, unknown> } } } }
    | null;
  const property = asObject(data?.props?.pageProps?.componentProps?.property);
  if (!property) return {};

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

  const rawPhotos = Array.isArray(property.photos) ? property.photos : [];
  const urls = rawPhotos
    .map((p) => (p && typeof p === 'object' ? coerceString((p as Record<string, unknown>).url) : undefined))
    .filter((u): u is string => typeof u === 'string');
  const photos = resolvePhotoUrls(urls, sourceUrl);
  if (photos) fields.photos = photos;

  return fields;
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
