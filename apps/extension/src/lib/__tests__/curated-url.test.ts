/**
 * Tests for lib/curated-url.ts — isCuratedDetailUrl (Fix 8, AIN-72).
 *
 * By testing the real export from the chrome-free module we prove that the
 * production predicate AND the background SW's sender-validation path use
 * the same logic (no shadow copy).
 */
import { describe, it, expect } from 'vitest';
import { isCuratedDetailUrl } from '../curated-url';

describe('isCuratedDetailUrl (chrome-free module)', () => {
  it('accepts a Zillow detail page', () => {
    expect(
      isCuratedDetailUrl(
        'https://www.zillow.com/homedetails/123-W-Main-St-Madison-WI-53703/12345678_zpid/',
      ),
    ).toBe(true);
  });

  it('accepts an apartments.com detail page with a numeric token', () => {
    expect(
      isCuratedDetailUrl('https://www.apartments.com/the-james-madison-wi/abc1234/'),
    ).toBe(true);
  });

  it('rejects an apartments.com category page (all-alpha second segment)', () => {
    expect(isCuratedDetailUrl('https://www.apartments.com/madison-wi/rentals/')).toBe(false);
    expect(isCuratedDetailUrl('https://www.apartments.com/madison-wi/apartments/')).toBe(false);
    expect(isCuratedDetailUrl('https://www.apartments.com/madison-wi/houses/')).toBe(false);
  });

  it('rejects a Zillow search page (not a detail page)', () => {
    expect(isCuratedDetailUrl('https://www.zillow.com/madison-wi/rentals/')).toBe(false);
  });

  it('rejects a non-curated domain', () => {
    expect(isCuratedDetailUrl('https://example.com/homedetails/foo')).toBe(false);
  });

  it('rejects a chrome:// URL (not capturable)', () => {
    expect(isCuratedDetailUrl('chrome://extensions/')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isCuratedDetailUrl('')).toBe(false);
  });

  it('rejects a malformed URL', () => {
    expect(isCuratedDetailUrl('not a url')).toBe(false);
  });

  it('accepts a Craigslist apartment detail URL', () => {
    expect(
      isCuratedDetailUrl(
        'https://madison.craigslist.org/apa/d/madison-2br-near-campus/7712345678.html',
      ),
    ).toBe(true);
  });

  it('rejects a Craigslist search URL', () => {
    expect(isCuratedDetailUrl('https://madison.craigslist.org/search/apa')).toBe(false);
  });

  it('accepts x01oncampus.com (marketing-site class — all pages are detail)', () => {
    expect(isCuratedDetailUrl('https://x01oncampus.com/floor-plans/')).toBe(true);
    expect(isCuratedDetailUrl('https://x01oncampus.com/')).toBe(true);
  });
});
