/**
 * Layer-3 per-site DOM fallback extractors (AIN-47, Days 5-6).
 *
 * When JSON-LD (Pass 1) and OpenGraph (Pass 2) come up short, this layer runs
 * a per-site extractor keyed off `deriveSourceDomain` output (`zillow.com`,
 * `trulia.com`, `realtor.com`, `apartments.com`, `facebook.com`). Each
 * extractor reads the listing out of the page's embedded JSON blob
 * (`__NEXT_DATA__` for the Next.js sites, a `ScheduledServerJS` blob for
 * Facebook, `window.__data` for Apartments.com) and/or labeled-DOM regexes
 * (`$X,XXX/mo`, "N beds", "N baths", "X sqft").
 *
 * Same philosophy as `json-ld.ts` / `og.ts`: NO HTML parser dependency. Regex
 * on well-defined embedded-JSON / labeled-DOM shapes is sufficient and keeps
 * `@campusnest/ai` free of new prod deps.
 *
 * Gap-fill semantics: each extractor returns only the fields it CONFIDENTLY
 * finds; the orchestrator (Task 3) fills only the fields still missing after
 * Pass 1/2. Every extractor degrades gracefully — `extractFromDom` wraps each
 * in try/catch and returns `{}` on any error, so escalation can fall through
 * to the LLM rare path (Layer 4) instead of throwing.
 *
 * The returned fields are RAW (un-normalized). The orchestrator runs
 * `normalizeFields` on the merged result.
 */

import type { ExtractedFields } from './types';
import { extractZillow } from './sites/zillow';
import { extractTrulia } from './sites/trulia';
import { extractRealtor } from './sites/realtor';
import { extractApartmentsCom } from './sites/apartments-com';
import { extractFacebook } from './sites/facebook';

/**
 * A per-site extractor. Takes the raw page HTML plus the (post-redirect)
 * source URL — used to resolve relative photo URLs — and returns the subset
 * of `ExtractedFields` it confidently found. Returns `{}` when it finds
 * nothing. A site extractor SHOULD avoid throwing, but `extractFromDom`
 * defends against it regardless.
 */
export type SiteExtractor = (html: string, sourceUrl: string) => Partial<ExtractedFields>;

/**
 * Site dispatch table. Keys MUST match `deriveSourceDomain` output exactly
 * (subdomains stripped, lowercased) — see `index.ts`.
 */
const SITE_EXTRACTORS: Record<string, SiteExtractor> = {
  'zillow.com': extractZillow,
  'trulia.com': extractTrulia,
  'realtor.com': extractRealtor,
  'apartments.com': extractApartmentsCom,
  'facebook.com': extractFacebook,
};

/**
 * Layer-3 entry point. Looks up a per-site extractor by `sourceDomain` and
 * runs it. Returns `{}` when no extractor matches, the extractor finds
 * nothing, or the extractor throws — a DOM extractor must degrade gracefully
 * so escalation can fall through to the LLM rare path.
 */
export function extractFromDom(
  html: string,
  sourceUrl: string,
  sourceDomain: string,
): Partial<ExtractedFields> {
  const extractor = SITE_EXTRACTORS[sourceDomain];
  if (!extractor) return {};
  try {
    return extractor(html, sourceUrl);
  } catch {
    // A per-site extractor should never throw, but third-party HTML is
    // unbounded — swallow and fall through so the orchestrator can escalate.
    return {};
  }
}

// ---------------------------------------------------------------------------
// Shared helpers (exported for unit testing + reuse across site extractors)
// ---------------------------------------------------------------------------

/**
 * Match the `<script id="__NEXT_DATA__" type="application/json">…</script>`
 * blob that Next.js emits (used by Zillow, Trulia, Realtor). Tolerates
 * attribute order variation and single quotes; `id` and `type` may appear in
 * either order.
 */
const NEXT_DATA_REGEX =
  /<script\b(?=[^>]*\bid\s*=\s*["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script\s*>/i;

/**
 * JSON.parse reviver that drops `__proto__` / `constructor` keys at parse
 * time — same prototype-pollution guard as `json-ld.ts`. The embedded blobs
 * this module parses originate from third-party HTML, so an attacker-supplied
 * own `__proto__` property could otherwise propagate through a downstream
 * `Object.assign`. Returning `undefined` causes JSON.parse to omit the key
 * entirely (ECMA-262 24.5.1).
 */
function safeReviver(key: string, value: unknown): unknown {
  if (key === '__proto__' || key === 'constructor') return undefined;
  return value;
}

/**
 * Pull and parse the `__NEXT_DATA__` JSON blob from the page. Returns the
 * parsed object (the site extractor navigates to its listing object from
 * there) or `null` when the blob is absent or unparseable. Never throws.
 *
 * Uses `safeReviver` to scrub `__proto__` / `constructor` keys.
 */
export function extractNextData(html: string): unknown | null {
  const match = NEXT_DATA_REGEX.exec(html);
  if (!match) return null;
  const body = (match[1] ?? '').trim();
  if (!body) return null;
  try {
    return JSON.parse(body, safeReviver);
  } catch {
    return null;
  }
}

/**
 * Parse a labeled-DOM number, e.g. "$1,950/mo" → 1950, "2 beds" → 2,
 * "1,200 sqft" → 1200. Strips thousands separators and takes the first numeric
 * token (handles fractional baths like "1.5"). Returns `undefined` on failure.
 */
export function parseLabeledNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const token = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!token) return undefined;
  const parsed = Number(token[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Resolve a possibly-relative URL against the source URL, http(s)-only.
 * Mirrors `safeResolveUrl` in `og.ts` (kept here so this module has no
 * cross-extractor import): `new URL('javascript:..', base)` parses
 * successfully, so dropping non-http schemes can only happen via an explicit
 * `.protocol` check. Returns `undefined` when resolution fails or the scheme
 * is not http(s); callers filter those out.
 */
export function resolvePhotoUrl(maybeRelative: string, base: string): string | undefined {
  try {
    const resolved = new URL(maybeRelative, base);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return undefined;
    return resolved.href;
  } catch {
    return undefined;
  }
}

/**
 * Resolve and dedupe a list of photo URLs against the source URL, dropping
 * non-http(s) entries. Returns `undefined` when nothing survives so callers
 * can omit the field entirely.
 */
export function resolvePhotoUrls(urls: readonly string[], base: string): string[] | undefined {
  const resolved = urls
    .map((u) => resolvePhotoUrl(u, base))
    .filter((u): u is string => typeof u === 'string');
  const deduped = Array.from(new Set(resolved));
  return deduped.length > 0 ? deduped : undefined;
}

/**
 * Coerce an unknown embedded-JSON value to a finite number. Accepts numbers
 * and numeric strings ("1,650", "$1,500/mo"). Returns `undefined` otherwise.
 * Used to read prices / counts out of embedded blobs where the publisher may
 * have serialized a value as either a number or a formatted string.
 */
export function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return parseLabeledNumber(value);
  return undefined;
}

/**
 * Read a non-empty trimmed string from an unknown embedded-JSON value.
 * Returns `undefined` for non-strings or blank strings.
 */
export function coerceString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Narrow an unknown to a plain object (non-array). Returns `undefined`
 * otherwise. Site extractors use this to walk embedded-JSON trees without a
 * cascade of inline `typeof` guards.
 */
export function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Pull `props.pageProps.propertyDetails` out of a parsed `__NEXT_DATA__` blob.
 * Both Realtor.com and Trulia put their listing object there (their *shapes*
 * differ — the caller projects fields — but the path is identical, so it's
 * lifted here once the 2nd Next.js site reused it). Returns `undefined` when
 * the blob is absent or the path doesn't resolve to an object.
 */
export function propertyDetailsFromNext(html: string): Record<string, unknown> | undefined {
  const data = asObject(extractNextData(html));
  const pageProps = asObject(asObject(data?.props)?.pageProps);
  return asObject(pageProps?.propertyDetails);
}
