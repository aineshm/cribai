/**
 * Tests for the AIN-98 SPA-navigation identity comparison.
 *
 * `content/index.ts`'s `checkNavigation()` used to compare the FULL
 * `location.href` (fragment-inclusive) and unconditionally unmount+remount
 * on ANY diff — including a pure hash change (a Zillow building page's unit
 * anchor, e.g. `#udp-<zpid>`). That threw away the 7s saved-reset timer and
 * the CHECK_SAVED-derived button state on every unit click, even though the
 * underlying page identity (and therefore the save-button state) hadn't
 * changed at all.
 *
 * `hrefIdentity` strips the hash so two URLs differing ONLY by fragment
 * compare equal; `shouldRemount` is the pure decision function `index.ts`
 * wires into its poll tick. Pure, no DOM/chrome imports — node-env testable,
 * same convention as saved-reset-timer.ts / state-machine.ts.
 */
import { describe, it, expect } from 'vitest';
import { hrefIdentity, shouldRemount } from '../navigation-compare';

describe('hrefIdentity', () => {
  it('excludes the hash fragment from the identity', () => {
    const withFragment = 'https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-2056051402';
    const withoutFragment = 'https://www.zillow.com/apartments/x/ChRJJw_zpid/';
    expect(hrefIdentity(withFragment)).toBe(hrefIdentity(withoutFragment));
  });

  it('includes origin, pathname, and search', () => {
    const a = hrefIdentity('https://www.zillow.com/apartments/x/?a=1');
    const b = hrefIdentity('https://www.zillow.com/apartments/y/?a=1');
    const c = hrefIdentity('https://www.zillow.com/apartments/x/?a=2');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('differs across origins even with the same path', () => {
    const a = hrefIdentity('https://www.zillow.com/apartments/x/');
    const b = hrefIdentity('https://www.apartments.com/apartments/x/');
    expect(a).not.toBe(b);
  });

  it('two different unit-anchor fragments on the same page resolve to the SAME identity', () => {
    const unit1 = 'https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-111';
    const unit2 = 'https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-222';
    expect(hrefIdentity(unit1)).toBe(hrefIdentity(unit2));
  });

  it('falls back to the raw string on an unparseable URL, never throws', () => {
    expect(() => hrefIdentity('not a url')).not.toThrow();
    expect(hrefIdentity('not a url')).toBe('not a url');
  });
});

describe('shouldRemount', () => {
  it('returns false when only the hash differs (identity unchanged)', () => {
    const oldHref = 'https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-111';
    const newHref = 'https://www.zillow.com/apartments/x/ChRJJw_zpid/#udp-222';
    expect(shouldRemount(oldHref, newHref)).toBe(false);
  });

  it('returns false when the href is byte-identical', () => {
    const href = 'https://www.zillow.com/apartments/x/ChRJJw_zpid/';
    expect(shouldRemount(href, href)).toBe(false);
  });

  it('returns true when the pathname changes (real navigation)', () => {
    const oldHref = 'https://www.zillow.com/apartments/x/ChRJJw_zpid/';
    const newHref = 'https://www.zillow.com/apartments/y/OtherId_zpid/';
    expect(shouldRemount(oldHref, newHref)).toBe(true);
  });

  it('returns true when the search params change (e.g. a real re-query)', () => {
    const oldHref = 'https://www.zillow.com/homes/for_rent/?page=1';
    const newHref = 'https://www.zillow.com/homes/for_rent/?page=2';
    expect(shouldRemount(oldHref, newHref)).toBe(true);
  });

  it('returns true when the origin changes', () => {
    const oldHref = 'https://www.zillow.com/apartments/x/';
    const newHref = 'https://www.apartments.com/apartments/x/';
    expect(shouldRemount(oldHref, newHref)).toBe(true);
  });

  it('is resilient to unparseable hrefs (compares raw strings, never throws)', () => {
    expect(() => shouldRemount('not a url', 'also not a url')).not.toThrow();
    expect(shouldRemount('not a url', 'not a url')).toBe(false);
    expect(shouldRemount('not a url', 'different garbage')).toBe(true);
  });
});
