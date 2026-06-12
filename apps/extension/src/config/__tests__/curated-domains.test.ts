/**
 * Tests for curated-domains.ts — detail-page detection per site.
 * Fixtures are taken from real URL patterns seen on each site.
 */
import { describe, it, expect } from 'vitest';
import { findCuratedDomain, isDetailPage } from '../curated-domains';

const CASES: Array<[string, boolean]> = [
  // Zillow detail pages
  [
    'https://www.zillow.com/homedetails/123-W-Main-St-Madison-WI-53703/12345678_zpid/',
    true,
  ],
  ['https://www.zillow.com/b/the-hub-madison-madison-wi-5XjKpF/', true],
  // Zillow search / non-detail
  ['https://www.zillow.com/madison-wi/rentals/', false],
  // Apartments.com detail — token contains a digit (Fix 4, AIN-72 review)
  ['https://www.apartments.com/the-james-madison-wi/abc1234/', true],
  // Apartments.com category pages — second segment is all-alpha → must be rejected (Fix 4)
  ['https://www.apartments.com/madison-wi/rentals/', false],
  ['https://www.apartments.com/madison-wi/apartments/', false],
  ['https://www.apartments.com/madison-wi/houses/', false],
  // Apartments.com search (one segment)
  ['https://www.apartments.com/madison-wi/', false],
  // Trulia detail
  [
    'https://www.trulia.com/p/wi/madison/123-w-main-st-madison-wi-53703--2086420134',
    true,
  ],
  // Realtor.com detail
  [
    'https://www.realtor.com/realestateandhomes-detail/123-W-Main-St_Madison_WI_53703_M12345-67890',
    true,
  ],
  // Craigslist apartment detail
  [
    'https://madison.craigslist.org/apa/d/madison-2br-near-campus/7712345678.html',
    true,
  ],
  // Craigslist search
  ['https://madison.craigslist.org/search/apa', false],
  // Marketing-site class: every page is a property detail
  ['https://x01oncampus.com/floor-plans/', true],
  ['https://x01oncampus.com/', true],
  // Not curated
  ['https://example.com/homedetails/whatever', false],
];

describe('curated-domains detail-page detection', () => {
  it.each(CASES)('%s → %s', (url, expected) => {
    const parsedUrl = new URL(url);
    const d = findCuratedDomain(parsedUrl.hostname);
    expect(Boolean(d && isDetailPage(d, parsedUrl))).toBe(expected);
  });
});
