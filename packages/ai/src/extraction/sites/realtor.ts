/**
 * Realtor.com Layer-3 DOM extractor (AIN-47).
 *
 * Primary path: the `__NEXT_DATA__` blob. Realtor's listing lives under
 * `props.pageProps.propertyDetails`, with `list_price`, a `description`
 * sub-object carrying `beds` / `baths` / `sqft` / `text`, a `location.address`
 * object (`line` / `city` / `state_code` / `postal_code` / `coordinate`), and
 * a `photos` array of `{href}` objects.
 *
 * Secondary path: labeled-span regex. Realtor renders the bed/bath/sqft in
 * `data-label="property-meta-*"` spans and the price in a
 * `data-testid="list-price"` element, so a partial survives a stripped blob.
 */

import type { ExtractedFields } from '../types';
import {
  propertyDetailsFromNext,
  asObject as obj,
  parseLabeledNumber,
  resolvePhotoUrls,
  coerceNumber,
  coerceString,
} from '../dom';

function fromNextData(html: string, sourceUrl: string): Partial<ExtractedFields> {
  const details = propertyDetailsFromNext(html);
  if (!details) return {};

  const fields: Partial<ExtractedFields> = {};

  const price = coerceNumber(details.list_price);
  if (price !== undefined) fields.price = price;

  const desc = obj(details.description);
  if (desc) {
    const bedrooms = coerceNumber(desc.beds);
    if (bedrooms !== undefined) fields.bedrooms = bedrooms;
    const bathrooms = coerceNumber(desc.baths);
    if (bathrooms !== undefined) fields.bathrooms = bathrooms;
    const sqft = coerceNumber(desc.sqft);
    if (sqft !== undefined) fields.square_feet = sqft;
    const text = coerceString(desc.text);
    if (text) fields.description = text;
  }

  const address = obj(obj(details.location)?.address);
  if (address) {
    const line = coerceString(address.line);
    if (line) fields.address = line;
    const city = coerceString(address.city);
    if (city) fields.city = city;
    const state = coerceString(address.state_code);
    if (state) fields.state = state;
    const zip = coerceString(address.postal_code);
    if (zip) fields.zip = zip;
    const coord = obj(address.coordinate);
    const lat = coerceNumber(coord?.lat);
    const lng = coerceNumber(coord?.lon);
    if (lat !== undefined && lng !== undefined) {
      fields.latitude = lat;
      fields.longitude = lng;
    }
  }

  const rawPhotos = Array.isArray(details.photos) ? details.photos : [];
  const urls = rawPhotos
    .map((p) => (p && typeof p === 'object' ? coerceString((p as Record<string, unknown>).href) : undefined))
    .filter((u): u is string => typeof u === 'string');
  const photos = resolvePhotoUrls(urls, sourceUrl);
  if (photos) fields.photos = photos;

  return fields;
}

function fromLabeledDom(html: string): Partial<ExtractedFields> {
  const fields: Partial<ExtractedFields> = {};
  const price = parseLabeledNumber(
    /data-testid=["']list-price["'][^>]*>\s*\$?([\d,]+)\s*\/?\s*mo/i.exec(html)?.[1],
  );
  if (price !== undefined) fields.price = price;
  const beds = parseLabeledNumber(
    /data-label=["']property-meta-beds["'][^>]*>\s*(\d+(?:\.\d+)?)/i.exec(html)?.[1],
  );
  if (beds !== undefined) fields.bedrooms = beds;
  const baths = parseLabeledNumber(
    /data-label=["']property-meta-baths["'][^>]*>\s*(\d+(?:\.\d+)?)/i.exec(html)?.[1],
  );
  if (baths !== undefined) fields.bathrooms = baths;
  const sqft = parseLabeledNumber(
    /data-label=["']property-meta-sqft["'][^>]*>\s*([\d,]+)/i.exec(html)?.[1],
  );
  if (sqft !== undefined) fields.square_feet = sqft;
  return fields;
}

export const extractRealtor = (html: string, sourceUrl: string): Partial<ExtractedFields> => {
  const blob = fromNextData(html, sourceUrl);
  const dom = fromLabeledDom(html);
  return { ...dom, ...blob };
};
