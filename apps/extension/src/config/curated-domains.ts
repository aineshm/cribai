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
    // Detail pages are a `/d/` segment preceded by a housing-category code
    // (apa, roo, sub, hou, vac, swp, prk, off, reb, reo), optionally
    // prefixed by a sub-region code (e.g. sfc, eby, pen):
    //   /apa/d/<slug>/<id>.html            (category only)
    //   /sfc/apa/d/<slug>/<id>.html        (sub-region + category)
    //   /sfc/roo/d/<slug>/<id>.html        (rooms/shared category)
    //   /sfc/sub/d/<slug>/<id>.html        (sublets category)
    // ...plus the separate site-wide "view" share-permalink shape, which
    // carries no category segment at all:
    //   /view/d/<slug>/<id>
    //
    // Review fix (AIN-102): the prior shape (`/^\/([a-z]{2,4}\/){1,2}d\//i`)
    // matched ANY 2-4 letter segment pair before `/d/`, so it silently
    // admitted every non-housing craigslist category too — jobs (/jjj/d/),
    // for-sale (/bik/d/), antiques (/atq/d/), etc. The category list below
    // is an explicit allowlist to keep capture+LLM-extraction scoped to
    // housing posts only.
    //
    // Trade-off: `/view/d/` links are category-less by design (they're
    // craigslist's own share-permalink shape), so this predicate can't tell
    // a shared housing post from a shared non-housing post at the URL level
    // alone. Accepted: mounting the button still requires the user to have
    // deliberately opened that specific page — this isn't a passive scan.
    //
    // Explicitly rejected: /search/apa (search results, not a detail page),
    // bare category listings like /apa/ or /sfc/apa/ (no /d/ segment), and
    // any category not in the housing allowlist (jobs, for-sale, etc.).
    isDetail: (u) =>
      /^\/(?:(?:[a-z]{2,4}\/)?(?:apa|roo|sub|hou|vac|swp|prk|off|reb|reo)\/d\/|view\/d\/)/i.test(
        u.pathname,
      ),
  },
  {
    hostSuffix: 'rentsfnow.com',
    // Detail pages: /apartments/rental/<slug>[/]. AIN-102.
    isDetail: (u) => /^\/apartments\/rental\/[^/]+\/?$/.test(u.pathname),
  },
  {
    hostSuffix: 'avaloncommunities.com',
    // Detail pages end in /apartment/<UNIT-CODE>/ where the unit code is
    // uppercase alphanumeric with dashes (e.g. CA009-CA009-840-404). Query
    // params (furnished, moveInDate, leaseTerm, ...) live outside
    // u.pathname so they don't affect this. AIN-102.
    //
    // Review fix (AIN-102): the prior predicate (`/\/apartment\//`) matched
    // any path merely containing an /apartment/ segment, e.g. a
    // /blog/apartment/renting-tips page. Anchoring to the terminal
    // unit-code segment scopes the match to actual detail pages.
    //
    // Deliberately no /i flag: case-sensitivity is what excludes lowercase
    // content slugs (e.g. "renting-tips-for-2026") from matching — real
    // unit codes are uppercase.
    isDetail: (u) => /\/apartment\/[A-Z0-9][A-Z0-9-]*\/?$/.test(u.pathname),
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
