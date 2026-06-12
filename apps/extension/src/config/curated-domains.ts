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
    isDetail: (u) => /^\/(homedetails|b)\//.test(u.pathname),
  },
  {
    hostSuffix: 'apartments.com',
    // Detail pages: /<slug>/<token>/ where token is ≥4 alphanumeric chars.
    // Search pages: /<city-state>/ (no second path segment with a token).
    isDetail: (u) => /^\/[a-z0-9-]+\/[a-z0-9]{4,}\/?$/i.test(u.pathname),
  },
  {
    hostSuffix: 'trulia.com',
    isDetail: (u) => /^\/(p|home)\//.test(u.pathname),
  },
  {
    hostSuffix: 'realtor.com',
    isDetail: (u) => u.pathname.startsWith('/realestateandhomes-detail/'),
  },
  {
    hostSuffix: 'craigslist.org',
    isDetail: (u) => /^\/apa\/d\//.test(u.pathname),
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
