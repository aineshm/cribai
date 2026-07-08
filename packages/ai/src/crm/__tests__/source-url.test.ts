/**
 * Tests for source-url.ts (AIN-98 Task 1).
 *
 * `normalizeSourceUrl` is the single normalization chokepoint `addListing`
 * and `/api/crm/saved` both call so a fragment-only or tracking-param-only
 * variant of the same listing URL collapses onto the same (user_id,
 * source_url) identity. `parseUnitFragment` reads the unit-selection signal
 * out of a URL fragment BEFORE that fragment gets stripped.
 *
 * Real prod pairs this fixes (2026-07-08 evidence, see the AIN-98 plan doc):
 *   - 100 Van Ness (apartments.com): `…/yv6dh0t/#cjzhjxg-2-unit` vs `…/yv6dh0t/`
 *   - Parkmerced (apartments.com): `…/26ht3d9/#pbczdcv-1-floorPlan` vs `…/26ht3d9/`
 *   - Trinity (Zillow): `…/Ch4m2W/#udp-463380384` — the fragment IS the unit
 *     identity Zillow uses; parseUnitFragment must recover it.
 */
import { describe, it, expect } from 'vitest';
import { normalizeSourceUrl, parseUnitFragment } from '../source-url';

describe('normalizeSourceUrl', () => {
  it('strips a Zillow #udp-<zpid> fragment (Trinity save, AIN-94 motivating example)', () => {
    const raw = 'https://www.zillow.com/homedetails/Trinity-Apts/Ch4m2W_zpid/#udp-463380384';
    expect(normalizeSourceUrl(raw)).toBe(
      'https://www.zillow.com/homedetails/Trinity-Apts/Ch4m2W_zpid',
    );
  });

  it('collapses the real 100 Van Ness apartments.com pair onto one identity', () => {
    const withUnitFragment =
      'https://www.apartments.com/100-van-ness-san-francisco-ca/yv6dh0t/#cjzhjxg-2-unit';
    const bare = 'https://www.apartments.com/100-van-ness-san-francisco-ca/yv6dh0t/';

    expect(normalizeSourceUrl(withUnitFragment)).toBe(normalizeSourceUrl(bare));
    expect(normalizeSourceUrl(bare)).toBe(
      'https://www.apartments.com/100-van-ness-san-francisco-ca/yv6dh0t',
    );
  });

  it('collapses the real Parkmerced apartments.com pair onto one identity', () => {
    const withFloorPlanFragment =
      'https://www.apartments.com/parkmerced-san-francisco-ca/26ht3d9/#pbczdcv-1-floorPlan';
    const bare = 'https://www.apartments.com/parkmerced-san-francisco-ca/26ht3d9/';

    expect(normalizeSourceUrl(withFloorPlanFragment)).toBe(normalizeSourceUrl(bare));
  });

  it('preserves the Avalon unit-config query params (furnished/moveInDate/leaseTerm are NOT tracking params)', () => {
    const raw =
      'https://www.avaloncommunities.com/california/san-francisco-apartments/avalon-mission-bay?furnished=false&moveInDate=07%2F30%2F2026&leaseTerm=13';
    const normalized = normalizeSourceUrl(raw);
    expect(normalized).toContain('furnished=false');
    expect(normalized).toContain('moveInDate=07%2F30%2F2026');
    expect(normalized).toContain('leaseTerm=13');
  });

  it('strips utm_* and other denylisted tracking params', () => {
    const raw =
      'https://example.com/listing/123?utm_source=newsletter&utm_medium=email&gclid=abc&fbclid=def&msclkid=ghi&dclid=jkl&igshid=mno&mc_cid=pqr&mc_eid=stu&keep=me';
    const normalized = normalizeSourceUrl(raw);
    expect(normalized).toBe('https://example.com/listing/123?keep=me');
  });

  it('lowercases protocol and hostname', () => {
    const raw = 'HTTPS://WWW.Zillow.COM/homedetails/foo/123_zpid/';
    expect(normalizeSourceUrl(raw)).toBe('https://www.zillow.com/homedetails/foo/123_zpid');
  });

  it('strips a single trailing slash from a non-root path', () => {
    expect(normalizeSourceUrl('https://example.com/a/b/')).toBe('https://example.com/a/b');
  });

  it('does not strip the root path slash', () => {
    expect(normalizeSourceUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('sorts remaining query params for determinism, preserving values verbatim', () => {
    const a = normalizeSourceUrl('https://example.com/x?b=2&a=1');
    const b = normalizeSourceUrl('https://example.com/x?a=1&b=2');
    expect(a).toBe(b);
    expect(a).toBe('https://example.com/x?a=1&b=2');
  });

  it('passes unparseable input through unchanged (trimmed), never throws', () => {
    expect(normalizeSourceUrl('not a url at all')).toBe('not a url at all');
    expect(normalizeSourceUrl('  not a url  ')).toBe('not a url');
  });

  it('is idempotent: normalize(normalize(x)) === normalize(x)', () => {
    const inputs = [
      'https://www.zillow.com/homedetails/Trinity-Apts/Ch4m2W_zpid/#udp-463380384',
      'https://www.apartments.com/100-van-ness-san-francisco-ca/yv6dh0t/#cjzhjxg-2-unit',
      'https://example.com/listing/123?utm_source=newsletter&keep=me',
      'HTTPS://WWW.Zillow.COM/homedetails/foo/123_zpid/',
      'not a url at all',
    ];
    for (const input of inputs) {
      const once = normalizeSourceUrl(input);
      const twice = normalizeSourceUrl(once);
      expect(twice).toBe(once);
    }
  });
});

describe('parseUnitFragment', () => {
  it('parses a Zillow #udp-<zpid> fragment', () => {
    expect(parseUnitFragment('https://www.zillow.com/homedetails/x/1_zpid/#udp-463380384')).toEqual(
      { kind: 'zillow_udp', zpid: '463380384' },
    );
  });

  it('returns kind "unknown" for a non-udp fragment (apartments.com unit/floorPlan)', () => {
    expect(
      parseUnitFragment('https://www.apartments.com/x/yv6dh0t/#cjzhjxg-2-unit'),
    ).toEqual({ kind: 'unknown', fragment: 'cjzhjxg-2-unit' });

    expect(
      parseUnitFragment('https://www.apartments.com/x/26ht3d9/#pbczdcv-1-floorPlan'),
    ).toEqual({ kind: 'unknown', fragment: 'pbczdcv-1-floorPlan' });
  });

  it('returns null when there is no fragment', () => {
    expect(parseUnitFragment('https://example.com/a/b')).toBeNull();
  });

  it('returns null for an unparseable URL', () => {
    expect(parseUnitFragment('not a url')).toBeNull();
  });

  it('returns null for an empty fragment (bare trailing #)', () => {
    expect(parseUnitFragment('https://example.com/a/b#')).toBeNull();
  });
});
