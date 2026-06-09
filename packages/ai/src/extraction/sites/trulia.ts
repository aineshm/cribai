/**
 * Trulia Layer-3 DOM extractor (AIN-47).
 *
 * Trulia is Zillow-owned but ships a differently-shaped `__NEXT_DATA__` tree:
 * the listing lives under `props.pageProps.propertyDetails`, with the address
 * nested in `location`, price as `{amount}`, beds/baths/floorSpace as
 * `{value}` objects, description as `{value}`, and photos under
 * `media.photos[].url`.
 *
 * Secondary path: labeled-DOM regex. Trulia renders the address in a
 * `data-testid="home-details-summary-address"` element and the price/bed/bath
 * in `data-testid` list items, so a partial survives even when the blob is
 * stripped.
 */

import type { ExtractedFields } from '../types';
import {
  propertyDetailsFromNext,
  asObject as obj,
  parseLabeledNumber,
  resolvePhotoUrls,
  coerceNumber,
  coerceString,
  MONEY_RANGE,
  COUNT_RANGE,
} from '../dom';

function fromNextData(html: string, sourceUrl: string): Partial<ExtractedFields> {
  const details = propertyDetailsFromNext(html);
  if (!details) return {};

  const fields: Partial<ExtractedFields> = {};

  const price = coerceNumber(obj(details.price)?.amount);
  if (price !== undefined) fields.price = price;
  const bedrooms = coerceNumber(obj(details.bedrooms)?.value);
  if (bedrooms !== undefined) fields.bedrooms = bedrooms;
  const bathrooms = coerceNumber(obj(details.bathrooms)?.value);
  if (bathrooms !== undefined) fields.bathrooms = bathrooms;
  const sqft = coerceNumber(obj(details.floorSpace)?.value);
  if (sqft !== undefined) fields.square_feet = sqft;
  const description = coerceString(obj(details.description)?.value);
  if (description) fields.description = description;

  const loc = obj(details.location);
  if (loc) {
    const address = coerceString(loc.streetAddress);
    if (address) fields.address = address;
    const city = coerceString(loc.city);
    if (city) fields.city = city;
    const state = coerceString(loc.stateCode);
    if (state) fields.state = state;
    const zip = coerceString(loc.zipCode);
    if (zip) fields.zip = zip;
    const coords = obj(loc.coordinates);
    const lat = coerceNumber(coords?.latitude);
    const lng = coerceNumber(coords?.longitude);
    if (lat !== undefined && lng !== undefined) {
      fields.latitude = lat;
      fields.longitude = lng;
    }
  }

  const media = obj(details.media);
  const rawPhotos = Array.isArray(media?.photos) ? media!.photos : [];
  const urls = rawPhotos
    .map((p) => (p && typeof p === 'object' ? coerceString((p as Record<string, unknown>).url) : undefined))
    .filter((u): u is string => typeof u === 'string');
  const photos = resolvePhotoUrls(urls, sourceUrl);
  if (photos) fields.photos = photos;

  return fields;
}

function fromLabeledDom(html: string): Partial<ExtractedFields> {
  const fields: Partial<ExtractedFields> = {};
  const address = coerceString(
    /data-testid=["']home-details-summary-address["'][^>]*>\s*([^<]+?)\s*</i.exec(html)?.[1],
  );
  if (address) fields.address = address;
  const price = parseLabeledNumber(
    new RegExp(
      `data-testid=["']on-market-price-details["'][^>]*>\\s*${MONEY_RANGE}\\s*\\/?\\s*mo`,
      'i',
    ).exec(html)?.[1],
  );
  if (price !== undefined) fields.price = price;
  // A range ("2-3 beds") collapses to the LOW bound via parseLabeledNumber.
  // "Studio" is intentionally NOT mapped to 0 beds — left for gap-fill/LLM.
  const beds = parseLabeledNumber(new RegExp(`${COUNT_RANGE}\\s*beds?\\b`, 'i').exec(html)?.[1]);
  if (beds !== undefined) fields.bedrooms = beds;
  const baths = parseLabeledNumber(new RegExp(`${COUNT_RANGE}\\s*baths?\\b`, 'i').exec(html)?.[1]);
  if (baths !== undefined) fields.bathrooms = baths;
  const sqft = parseLabeledNumber(new RegExp(`${MONEY_RANGE}\\s*sqft\\b`, 'i').exec(html)?.[1]);
  if (sqft !== undefined) fields.square_feet = sqft;
  return fields;
}

export const extractTrulia = (html: string, sourceUrl: string): Partial<ExtractedFields> => {
  const blob = fromNextData(html, sourceUrl);
  const dom = fromLabeledDom(html);
  return { ...dom, ...blob };
};
