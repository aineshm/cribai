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
  // Zillow building/apartment-complex detail (AIN-83)
  [
    'https://www.zillow.com/apartments/san-francisco-ca/1177-market-at-trinity-place/Ch4m2W/',
    true,
  ],
  // Zillow search / non-detail
  ['https://www.zillow.com/madison-wi/rentals/', false],
  // Zillow /apartments/ root (no complex slug) — must stay rejected (AIN-83)
  ['https://www.zillow.com/apartments/', false],
  // Zillow search path that merely contains "apartments" as a later segment
  ['https://www.zillow.com/san-francisco-ca/apartments/', false],
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
  // Trulia building detail (AIN-102 founder sample)
  [
    'https://www.trulia.com/building/nema-8-10th-st-san-francisco-ca-94103-2748743167',
    true,
  ],
  // Trulia browse / non-detail
  ['https://www.trulia.com/rent/CA-San_Francisco/', false],
  // Realtor.com detail
  [
    'https://www.realtor.com/realestateandhomes-detail/123-W-Main-St_Madison_WI_53703_M12345-67890',
    true,
  ],
  // Craigslist apartment detail (classic sub-region-prefixed shape)
  [
    'https://madison.craigslist.org/apa/d/madison-2br-near-campus/7712345678.html',
    true,
  ],
  [
    'https://sfbay.craigslist.org/sfc/apa/d/san-francisco-nice-apt/7712345678.html',
    true,
  ],
  // Craigslist "view" detail shape (AIN-102 founder samples)
  [
    'https://www.craigslist.org/view/d/san-francisco-bd-ba-controlled-access/3AcH7s316KDmRYxYQbryR',
    true,
  ],
  [
    'https://www.craigslist.org/view/d/san-francisco-stainless-steel/dhaXFva1H8YC4tykJMarEX',
    true,
  ],
  // Craigslist other housing categories with /d/ (rooms, sublets)
  [
    'https://sfbay.craigslist.org/sfc/roo/d/san-francisco-room-in-house/7712345679.html',
    true,
  ],
  [
    'https://sfbay.craigslist.org/sfc/sub/d/san-francisco-sublet/7712345680.html',
    true,
  ],
  // Craigslist search — must stay rejected
  ['https://madison.craigslist.org/search/apa', false],
  // Craigslist category listing (no /d/) — must stay rejected
  ['https://sfbay.craigslist.org/sfc/apa/', false],
  // Craigslist homepage — must stay rejected
  ['https://www.craigslist.org/', false],
  // Craigslist non-housing categories — must be rejected (review fix, AIN-102)
  [
    'https://sfbay.craigslist.org/jjj/d/software-engineer/123.html',
    false,
  ],
  [
    'https://sfbay.craigslist.org/sfc/sof/d/dev-job/123.html',
    false,
  ],
  ['https://sfbay.craigslist.org/atq/d/vintage-lamp/123.html', false],
  ['https://sfbay.craigslist.org/bik/d/road-bike/123.html', false],
  // Apartments.com building detail with unit fragment (AIN-102 founder sample)
  [
    'https://www.apartments.com/100-van-ness-san-francisco-ca/yv6dh0t/#cjzhjxg-2-unit',
    true,
  ],
  ['https://www.apartments.com/100-van-ness-san-francisco-ca/yv6dh0t/', true],
  // rentsfnow.com detail (AIN-102, new domain)
  ['https://www.rentsfnow.com/apartments/rental/350-judah-50', true],
  ['https://www.rentsfnow.com/apartments/rental/350-judah-206/', true],
  // rentsfnow.com root — must be rejected
  ['https://www.rentsfnow.com/', false],
  // avaloncommunities.com detail (AIN-102, new domain) — query params must not break the match
  [
    'https://www.avaloncommunities.com/california/san-francisco-apartments/ava-nob-hill/apartment/CA009-CA009-840-404/?furnished=false&moveInDate=07%2F30%2F2026&leaseTerm=13',
    true,
  ],
  // avaloncommunities.com community page without /apartment/ segment — must be rejected
  [
    'https://www.avaloncommunities.com/california/san-francisco-apartments/ava-nob-hill/',
    false,
  ],
  // avaloncommunities.com non-detail pages containing an "apartment"-like
  // segment that isn't the anchored /apartment/<UNIT-CODE>/ shape — must be
  // rejected (review fix, AIN-102)
  [
    'https://www.avaloncommunities.com/blog/apartment/renting-tips-for-2026',
    false,
  ],
  [
    'https://www.avaloncommunities.com/california/san-francisco-apartments/ava-nob-hill/apartment-homes/',
    false,
  ],
  ['https://www.avaloncommunities.com/', false],
  // rentsfnow.com browse pages — plural /apartments/ must stay rejected (Fix 3, AIN-102)
  ['https://www.rentsfnow.com/apartments/', false],
  ['https://www.rentsfnow.com/apartments/rentals/foo', false],
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
