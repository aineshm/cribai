/**
 * source-url — listing URL identity normalization (AIN-98).
 *
 * Two live duplicate pairs on the founder's own CRM account (both saved
 * 2026-07-07/08, both survived migration 046's unique index because the
 * strings differed by a URL fragment) motivated this module:
 *   - 100 Van Ness (apartments.com): `…/yv6dh0t/#cjzhjxg-2-unit` vs `…/yv6dh0t/`
 *   - Parkmerced (apartments.com): `…/26ht3d9/#pbczdcv-1-floorPlan` vs `…/26ht3d9/`
 *
 * `addListing` (the single insert/dedup chokepoint for all three save
 * callers) and `/api/crm/saved` (the extension's green-button check) both
 * normalize through this module so a fragment-only or tracking-param-only
 * variant of the same listing collapses onto the same (user_id, source_url)
 * identity.
 *
 * Pure, no I/O, no chrome/DOM imports — safe to import from web routes,
 * `packages/ai`, and (in principle) test-only extension code.
 */

/**
 * Query-param names that are pure tracking noise and safe to strip
 * unconditionally. Deliberately NARROW: the Avalon save
 * `?furnished=false&moveInDate=07%2F30%2F2026&leaseTerm=13` carries
 * unit-config selections, not tracking, so only exact matches on this
 * denylist are removed — never a heuristic ("anything starting with utm").
 * `utm_*` is the one prefix-matched family; every other entry is an exact
 * param name.
 */
const TRACKING_PARAM_DENYLIST = new Set([
  'gclid',
  'fbclid',
  'msclkid',
  'dclid',
  'igshid',
  'mc_cid',
  'mc_eid',
]);

/** True when `paramName` should be stripped as tracking noise. */
function isTrackingParam(paramName: string): boolean {
  if (paramName.startsWith('utm_')) return true;
  return TRACKING_PARAM_DENYLIST.has(paramName);
}

/**
 * Normalize a listing source URL so equivalent variants (differing only by
 * fragment, tracking params, param order, scheme/host casing, or a single
 * trailing slash) collapse onto the same identity string.
 *
 * Never throws: an unparseable `raw` value is returned trimmed and
 * otherwise unchanged — `addListing`'s own extraction/validation already
 * handles genuinely garbage input, so this function doesn't need to.
 *
 * Steps (in order):
 *   1. Parse with `URL`. On failure, return `raw.trim()`.
 *   2. Lowercase protocol + hostname (path/query/fragment case is
 *      preserved — some publishers use case-sensitive slugs).
 *   3. Drop the fragment entirely (unit-selection signal is read out via
 *      `parseUnitFragment` BEFORE calling this function, not after).
 *   4. Remove ONLY denylisted tracking params (see `TRACKING_PARAM_DENYLIST`).
 *   5. Sort the remaining query params by key for determinism — values are
 *      preserved verbatim (no re-encoding, so `07%2F30%2F2026` survives
 *      byte-for-byte).
 *   6. Strip a single trailing slash from a non-root pathname.
 */
export function normalizeSourceUrl(raw: string): string {
  const trimmed = raw.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  const protocol = url.protocol.toLowerCase();
  const hostname = url.hostname.toLowerCase();

  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  const keptParams: Array<[string, string]> = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (isTrackingParam(key)) continue;
    keptParams.push([key, value]);
  }
  keptParams.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const query = keptParams
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  const port = url.port ? `:${url.port}` : '';
  const search = query ? `?${query}` : '';

  return `${protocol}//${hostname}${port}${pathname}${search}`;
}

// ---------------------------------------------------------------------------
// Unit-fragment parsing
// ---------------------------------------------------------------------------

/** A recognized unit-selection signal parsed out of a URL fragment. */
export type ParsedUnitFragment =
  | { readonly kind: 'zillow_udp'; readonly zpid: string }
  | { readonly kind: 'unknown'; readonly fragment: string };

const ZILLOW_UDP_FRAGMENT_RE = /^udp-(\d+)$/;

/**
 * Parse the unit-selection signal out of a URL's fragment, BEFORE
 * `normalizeSourceUrl` strips it.
 *
 * Returns:
 *   - `{ kind: 'zillow_udp', zpid }` for Zillow's `#udp-<zpid>` shape — the
 *     one fragment format this codebase can resolve to a concrete unit
 *     (`resolveZillowUnit`, Task 2) because Zillow building pages carry a
 *     structured `floorPlans[].units[]` blob keyed by zpid.
 *   - `{ kind: 'unknown', fragment }` for any other non-empty fragment
 *     (e.g. apartments.com's `#<key>-<n>-unit` / `#<key>-<n>-floorPlan` —
 *     no structured per-unit data exists for these, so they're recognized
 *     but not resolved; see the AIN-98 plan's "explicitly out of scope").
 *   - `null` when there is no fragment, the fragment is empty, or the URL
 *     doesn't parse.
 *
 * Never throws.
 */
export function parseUnitFragment(raw: string): ParsedUnitFragment | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (!fragment) return null;

  const udpMatch = ZILLOW_UDP_FRAGMENT_RE.exec(fragment);
  if (udpMatch) {
    return { kind: 'zillow_udp', zpid: udpMatch[1]! };
  }

  return { kind: 'unknown', fragment };
}
