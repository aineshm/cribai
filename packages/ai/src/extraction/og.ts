/**
 * OpenGraph extraction — the fallback path when JSON-LD is missing or sparse.
 *
 * Parses `<meta property="og:*">` (and `<meta name="og:*">`, which a small
 * number of sites use) plus `product:*` / `og:price:*` tags that several
 * listing sites use to surface price.
 *
 * No HTML parser dependency — same rationale as `json-ld.ts`: regex on
 * well-defined `<meta>` tags is sufficient and keeps `@campusnest/ai` clean.
 */

import type { ExtractedListing } from './types';

// `<meta ...>` — captures the full attribute block. We then look for
// `property="…"` / `name="…"` / `content="…"` inside the captured block.
// Tolerates self-closing `/>` and attribute order variation.
const META_TAG_REGEX = /<meta\b([^>]*)\/?>/gi;

const ATTR_PROPERTY_REGEX = /\bproperty\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const ATTR_NAME_REGEX = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const ATTR_CONTENT_REGEX = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Minimal HTML entity decoder — covers the entities that actually appear in
 * `meta content="…"` attributes (ampersands, quotes, apostrophes, less-than /
 * greater-than, and numeric character references). Anything else is left
 * untouched, which is fine for our normalized output.
 */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // &amp; must come last, otherwise it double-decodes entities.
    .replace(/&amp;/g, '&');
}

/**
 * Parse every `<meta>` tag in the HTML into a flat key→value(s) map.
 * Keys are normalized to lowercase. Multiple occurrences of the same key
 * are preserved in `multi` to support `og:image` arrays.
 */
export function parseMetaTags(html: string): {
  single: Record<string, string>;
  multi: Record<string, string[]>;
} {
  const single: Record<string, string> = {};
  const multi: Record<string, string[]> = {};

  const matches = html.matchAll(META_TAG_REGEX);
  for (const match of matches) {
    const attrs = match[1] ?? '';
    const propMatch = ATTR_PROPERTY_REGEX.exec(attrs);
    const nameMatch = !propMatch ? ATTR_NAME_REGEX.exec(attrs) : null;
    const contentMatch = ATTR_CONTENT_REGEX.exec(attrs);
    if (!contentMatch) continue;

    const rawKey = propMatch ? propMatch[1] ?? propMatch[2] : nameMatch ? nameMatch[1] ?? nameMatch[2] : undefined;
    if (!rawKey) continue;
    const key = rawKey.trim().toLowerCase();
    const rawContent = contentMatch[1] ?? contentMatch[2] ?? '';
    const content = decodeHtmlEntities(rawContent).trim();
    if (content === '') continue;

    if (single[key] === undefined) single[key] = content;
    if (!multi[key]) multi[key] = [];
    multi[key].push(content);
  }

  return { single, multi };
}

/**
 * Coerce a string price like "$1,950" or "1950.00 USD" to a number. Handles:
 *   - Space-separated thousands ("1 800") — decodeHtmlEntities() above turns
 *     `&nbsp;` into a normal space, so OG prices written as "1&nbsp;800"
 *     arrive here as "1 800" and must collapse to "1800".
 *   - Ranged values like "$1,800 - $2,200" — collapse to the lower bound;
 *     multi-unit pages publish rent as a range and the low is the value
 *     students filter by.
 */
function parsePrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  // Collapse any whitespace BETWEEN digits (locale-style thousands separator)
  // into nothing, but preserve standalone whitespace between tokens so a
  // range "1 800 - 2 200" still resolves to two tokens (1800, 2200).
  const normalized = raw.replace(/(\d)[\s   ](?=\d)/g, '$1');
  const tokens = normalized.match(/-?\d[\d,]*(?:\.\d+)?/g);
  if (!tokens || tokens.length === 0) return undefined;
  const first = tokens[0]!.replace(/,/g, '');
  const parsed = Number(first);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Resolve a possibly-relative URL against the source URL. Returns the input
 * unchanged when it's not parseable (we'd rather pass through a weird URL
 * than drop the photo entirely).
 */
function safeResolveUrl(maybeRelative: string, base: string): string {
  try {
    return new URL(maybeRelative, base).href;
  } catch {
    return maybeRelative;
  }
}

/**
 * Project parsed OG/Twitter meta tags into the subset of `ExtractedListing`
 * fields that OG can populate. Everything is optional — caller decides
 * confidence based on which fields came through.
 */
export function extractFromOg(
  html: string,
  sourceUrl: string,
): {
  fields: Omit<ExtractedListing, 'source_url' | 'source_domain' | 'extraction_method' | 'extraction_confidence'>;
  raw_og: Record<string, string>;
  hasAnyOgData: boolean;
} {
  const { single, multi } = parseMetaTags(html);

  const fields: Omit<ExtractedListing, 'source_url' | 'source_domain' | 'extraction_method' | 'extraction_confidence'> = {};
  const raw_og: Record<string, string> = {};

  const ogKeys = Object.keys(single).filter((k) => k.startsWith('og:') || k.startsWith('product:') || k.startsWith('twitter:'));
  for (const k of ogKeys) {
    const v = single[k];
    if (v !== undefined) raw_og[k] = v;
  }

  const title = single['og:title'] ?? single['twitter:title'];
  if (title) fields.title = title;

  const description = single['og:description'] ?? single['twitter:description'];
  if (description) fields.description = description;

  // Photos: prefer multi og:image, fall back to twitter:image.
  const photoSources = multi['og:image'] ?? (single['twitter:image'] ? [single['twitter:image']] : []);
  if (photoSources.length > 0) {
    const photos = Array.from(new Set(photoSources.map((p) => safeResolveUrl(p, sourceUrl))));
    if (photos.length > 0) fields.photos = photos;
  }

  // Price — sites use `og:price:amount`, `product:price:amount`, or both.
  const priceRaw = single['og:price:amount'] ?? single['product:price:amount'];
  const price = parsePrice(priceRaw);
  if (price !== undefined) fields.price = price;

  const hasAnyOgData = Object.keys(raw_og).length > 0;
  return { fields, raw_og, hasAnyOgData };
}
