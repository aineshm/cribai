/**
 * Apartments.com Layer-3 DOM extractor (AIN-47).
 *
 * JSON-LD (Pass 1) is usually strong on Apartments.com — but on multi-unit
 * pages the publisher routinely OMITS rent / bed / bath from JSON-LD and
 * renders them only in labeled spans (`class="rentInfoDetail"`, "Beds",
 * "Baths"). This layer regexes those out, and reads the address (which the
 * spans don't carry) from the `window.__data` blob when present.
 *
 * Labeled-span shapes the site uses:
 *   - rent:  `<p class="rentInfoDetail">$1,895/mo</p>`
 *   - beds:  `<p class="bedRangeInfo"><span class="rentInfoDetail">2 Beds</span></p>`
 *   - baths: `<p class="bathRangeInfo"><span class="rentInfoDetail">1 Bath</span></p>`
 *   - sqft:  `<p class="sqftInfo"><span class="rentInfoDetail">720 sqft</span></p>`
 */

import type { ExtractedFields } from '../types';
import { parseLabeledNumber, resolvePhotoUrls, coerceString } from '../dom';

/**
 * Read `window.__data = {…};` from an inline script. Non-greedy to the first
 * `};` — the fixture (and the real site's address blob) is a single statement,
 * so a naive object capture is sufficient here. Gap-fill semantics mean a
 * miss just leaves the address unfilled; it never breaks the rest of the
 * extraction.
 */
const WINDOW_DATA_REGEX = /window\.__data\s*=\s*(\{[\s\S]*?\})\s*;/i;

function fromWindowData(html: string): Partial<ExtractedFields> {
  const match = WINDOW_DATA_REGEX.exec(html);
  if (!match || !match[1]) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return {};
  }
  const root = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  const listing = root?.listing && typeof root.listing === 'object' ? (root.listing as Record<string, unknown>) : undefined;
  const address = listing?.address && typeof listing.address === 'object' ? (listing.address as Record<string, unknown>) : undefined;
  if (!address) return {};

  const fields: Partial<ExtractedFields> = {};
  const street = coerceString(address.streetAddress);
  if (street) fields.address = street;
  const city = coerceString(address.city);
  if (city) fields.city = city;
  const state = coerceString(address.state);
  if (state) fields.state = state;
  const zip = coerceString(address.postalCode);
  if (zip) fields.zip = zip;
  return fields;
}

function fromLabeledDom(html: string, sourceUrl: string): Partial<ExtractedFields> {
  const fields: Partial<ExtractedFields> = {};
  const price = parseLabeledNumber(
    /class=["']rentInfoDetail["'][^>]*>\s*\$?([\d,]+)\s*\/?\s*mo/i.exec(html)?.[1],
  );
  if (price !== undefined) fields.price = price;
  const beds = parseLabeledNumber(
    /class=["']bedRangeInfo["'][\s\S]*?(\d+(?:\.\d+)?)\s*beds?\b/i.exec(html)?.[1],
  );
  if (beds !== undefined) fields.bedrooms = beds;
  const baths = parseLabeledNumber(
    /class=["']bathRangeInfo["'][\s\S]*?(\d+(?:\.\d+)?)\s*baths?\b/i.exec(html)?.[1],
  );
  if (baths !== undefined) fields.bathrooms = baths;
  const sqft = parseLabeledNumber(
    /class=["']sqftInfo["'][\s\S]*?([\d,]+)\s*sqft\b/i.exec(html)?.[1],
  );
  if (sqft !== undefined) fields.square_feet = sqft;

  const photoSrc = coerceString(
    /class=["']mainImage["'][^>]*\bsrc=["']([^"']+)["']/i.exec(html)?.[1],
  );
  if (photoSrc) {
    const photos = resolvePhotoUrls([photoSrc], sourceUrl);
    if (photos) fields.photos = photos;
  }
  return fields;
}

export const extractApartmentsCom = (html: string, sourceUrl: string): Partial<ExtractedFields> => {
  const address = fromWindowData(html);
  const dom = fromLabeledDom(html, sourceUrl);
  return { ...dom, ...address };
};
