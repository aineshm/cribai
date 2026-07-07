/**
 * Curated domain list for the CribAI in-page save button (AIN-72).
 *
 * Each entry declares a `hostSuffix` matched against the page's hostname
 * and an `isDetail` predicate that gates the button to listing detail pages
 * only (not search / browse pages). The list is intentionally kept short and
 * curated — it is both the content-script injection surface and the install
 * warning the user sees in the Chrome Web Store.
 *
 * IMPORTANT: The manifest.json `content_scripts.matches` list MUST mirror the
 * domain suffixes here. A unit test (curated-domains.test.ts + manifest-
 * domains-agreement.test.ts) enforces the two are in sync.
 */

export interface CuratedDomain {
  /** Matched against hostname with endsWith after a leading-dot normalize. */
  readonly hostSuffix: string;
  /** Tests pathname (+ search where needed). Returns true for detail pages only. */
  readonly isDetail: (url: URL) => boolean;
}

export const CURATED_DOMAINS: readonly CuratedDomain[] = [
  {
    hostSuffix: 'zillow.com',
    // Zillow building/complex pages (the AIN-83 class) live under /apartments/.
    isDetail: (u) => /^\/(homedetails\/|b\/|apartments\/[^/]+)/.test(u.pathname),
  },
  {
    hostSuffix: 'apartments.com',
    // Detail pages: /<slug>/<token>/ where token is ≥4 alphanumeric chars AND
    // contains at least one digit (e.g. 'abc1234'). This rejects category pages
    // like /madison-wi/rentals/, /madison-wi/apartments/, /madison-wi/houses/
    // whose second segments are all-alpha slugs.
    isDetail: (u) => /^\/[a-z0-9-]+\/[a-z0-9]*\d[a-z0-9]*\/?$/i.test(u.pathname),
  },
  {
    hostSuffix: 'trulia.com',
    // /building/ added AIN-102 (apartment-complex detail pages).
    isDetail: (u) => /^\/(p|home|building)\//.test(u.pathname),
  },
  {
    hostSuffix: 'realtor.com',
    isDetail: (u) => u.pathname.startsWith('/realestateandhomes-detail/'),
  },
  {
    hostSuffix: 'craigslist.org',
    // Detail pages are a `/d/` segment preceded by 1-2 short (2-4 letter)
    // lowercase path segments: the housing category (apa, roo, sub, ...)
    // optionally prefixed by a sub-region code (e.g. sfc, eby, pen). This
    // single shape covers every founder-observed sample without special-
    // casing individual categories:
    //   /apa/d/<slug>/<id>.html            (category only)
    //   /sfc/apa/d/<slug>/<id>.html        (sub-region + category)
    //   /sfc/roo/d/<slug>/<id>.html        (rooms/shared category)
    //   /sfc/sub/d/<slug>/<id>.html        (sublets category)
    //   /view/d/<slug>/<id>                (site-wide "view" shorthand —
    //                                        "view" itself is 4 lowercase
    //                                        letters, so it falls out of
    //                                        the same generic shape)
    // False-positive risk: a category/sub-region-shaped segment pair that
    // happens to be followed by a literal "d/" segment that isn't actually
    // a detail id. Not observed in practice; craigslist reserves "d" for
    // detail permalinks. Explicitly rejected by this shape: /search/apa
    // ("search" is 6 letters, exceeds the 2-4 letter cap) and bare category
    // listings like /apa/ or /sfc/apa/ (no trailing /d/ segment).
    isDetail: (u) => /^\/([a-z]{2,4}\/){1,2}d\//i.test(u.pathname),
  },
  {
    hostSuffix: 'rentsfnow.com',
    // Detail pages: /apartments/rental/<slug>[/]. AIN-102.
    isDetail: (u) => /^\/apartments\/rental\/[^/]+\/?$/.test(u.pathname),
  },
  {
    hostSuffix: 'avaloncommunities.com',
    // Detail pages contain a literal /apartment/ path segment (the unit
    // page nested under a community). Query params (furnished, moveInDate,
    // leaseTerm, ...) live outside u.pathname so they don't affect this.
    // AIN-102.
    isDetail: (u) => /\/apartment\//.test(u.pathname),
  },
  // Marketing-site class (AIN-71's page class):
  // The whole site IS the property — every page is a detail page.
  {
    hostSuffix: 'x01oncampus.com',
    isDetail: () => true,
  },
];

/**
 * Find the first CuratedDomain whose hostSuffix matches the given hostname.
 * Returns undefined when the hostname is not on the curated list.
 */
export function findCuratedDomain(hostname: string): CuratedDomain | undefined {
  const host = hostname.toLowerCase();
  return CURATED_DOMAINS.find(
    (d) => host === d.hostSuffix || host.endsWith('.' + d.hostSuffix),
  );
}

/**
 * Returns true when the URL is a listing detail page on its curated domain.
 * Always returns false if the domain is not curated.
 */
export function isDetailPage(domain: CuratedDomain, url: URL): boolean {
  return domain.isDetail(url);
}
