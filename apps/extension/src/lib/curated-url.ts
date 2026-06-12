/**
 * isCuratedDetailUrl — chrome-free predicate (AIN-72).
 *
 * Returns true when the given URL belongs to a curated listing domain AND
 * is an http(s) detail page (not a search / category page). Named
 * `isCuratedDetailUrl` to make explicit that it requires BOTH domain match
 * AND detail-page match.
 *
 * Kept in a chrome-free module so it can be imported by unit tests without
 * triggering chrome.runtime side-effects from background/index.ts.
 */

import { isCapturableUrl } from './capturable-url';
import { findCuratedDomain, isDetailPage } from '../config/curated-domains';

/**
 * Returns true when the URL belongs to a curated listing domain AND
 * is a listing detail page (not a search/category page).
 *
 * Both conditions must hold:
 *   1. The URL is http(s) (via isCapturableUrl).
 *   2. The hostname matches a curated domain.
 *   3. The pathname matches that domain's detail-page predicate.
 */
export function isCuratedDetailUrl(url: string): boolean {
  if (!isCapturableUrl(url)) return false;
  try {
    const parsed = new URL(url);
    const domain = findCuratedDomain(parsed.hostname);
    return domain !== undefined && isDetailPage(domain, parsed);
  } catch {
    return false;
  }
}
