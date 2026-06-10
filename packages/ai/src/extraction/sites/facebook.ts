/**
 * Facebook Marketplace Layer-3 DOM extractor (AIN-47).
 *
 * THIS IS THE WEAKEST PRODUCTION PATH. Facebook usually auth-walls / 403s a
 * live bot fetch — the parent task explicitly accepts this. The fetch layer
 * (`index.ts`) treats a login wall as a block signal, so in practice this
 * extractor often never runs against a real FB page. The synthetic fixture is
 * shaped so the logic remains testable.
 *
 * When a page DOES render, the listing payload is buried in a
 * `ScheduledServerJS` / `data-sjs` JSON blob under
 * `…marketplace_listing`. We pull that one blob and read the title, price
 * (`listing_price.amount`), description (`redacted_description.text`), and
 * photos (`listing_photos[].image.uri`). The `data-sjs` script carries
 * `type="application/json"` but NOT `application/ld+json`, so the JSON-LD
 * pass (`json-ld.ts`) never touches it — this layer owns it.
 */

import type { ExtractedFields } from '../types';
import { resolvePhotoUrls, coerceNumber, coerceString, asObject as obj, safeReviver } from '../dom';

/**
 * Match a `<script type="application/json" data-sjs>…</script>` blob. Several
 * may appear; we scan all of them and use the first that contains a
 * `marketplace_listing` payload.
 */
const SJS_SCRIPT_REGEX =
  /<script\b(?=[^>]*\bdata-sjs\b)[^>]*>([\s\S]*?)<\/script\s*>/gi;

/**
 * Depth-first search for the first `marketplace_listing` object anywhere in
 * the parsed blob. Facebook nests it deep inside
 * `require → ScheduledServerJS → __bbox → result → data`, and the exact path
 * drifts release to release — searching by key is more durable than pinning
 * the path. Bounded by a visited set so a (hypothetical) cyclic structure
 * can't spin.
 */
function findMarketplaceListing(root: unknown): Record<string, unknown> | undefined {
  const visited = new WeakSet<object>();
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (visited.has(node)) continue;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    const record = node as Record<string, unknown>;
    const ml = record.marketplace_listing;
    if (ml && typeof ml === 'object' && !Array.isArray(ml)) {
      return ml as Record<string, unknown>;
    }
    for (const value of Object.values(record)) stack.push(value);
  }
  return undefined;
}

function projectListing(
  listing: Record<string, unknown>,
  sourceUrl: string,
): Partial<ExtractedFields> {
  const fields: Partial<ExtractedFields> = {};

  const title = coerceString(listing.marketplace_listing_title);
  if (title) fields.title = title;
  const price = coerceNumber(obj(listing.listing_price)?.amount);
  if (price !== undefined) fields.price = price;
  const description = coerceString(obj(listing.redacted_description)?.text);
  if (description) fields.description = description;

  const rawPhotos = Array.isArray(listing.listing_photos) ? listing.listing_photos : [];
  const urls = rawPhotos
    .map((p) => coerceString(obj(obj(p)?.image)?.uri))
    .filter((u): u is string => typeof u === 'string');
  const photos = resolvePhotoUrls(urls, sourceUrl);
  if (photos) fields.photos = photos;

  return fields;
}

export const extractFacebook = (html: string, sourceUrl: string): Partial<ExtractedFields> => {
  const matches = html.matchAll(SJS_SCRIPT_REGEX);
  for (const match of matches) {
    const body = (match[1] ?? '').trim();
    if (!body) continue;
    let parsed: unknown;
    try {
      // safeReviver scrubs `__proto__` / `constructor` — same proto-pollution
      // defense as the __NEXT_DATA__ / JSON-LD paths (third-party HTML blob).
      parsed = JSON.parse(body, safeReviver);
    } catch {
      continue;
    }
    const listing = findMarketplaceListing(parsed);
    if (listing) return projectListing(listing, sourceUrl);
  }
  return {};
};
