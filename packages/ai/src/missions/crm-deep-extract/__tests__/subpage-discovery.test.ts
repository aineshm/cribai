/**
 * Tests for subpage-discovery.ts (AIN-71).
 */

import { describe, it, expect } from 'vitest';
import { discoverSubpages, isHousingRelated } from '../lib/subpage-discovery';

// ---------------------------------------------------------------------------
// discoverSubpages
// ---------------------------------------------------------------------------

const page = `<a href="/floor-plans">Floor Plans</a> <a href="/floorplans/2br">2BR</a>
  <a href="https://x01oncampus.com/pricing">Pricing</a> <a href="/about">About</a>
  <a href="https://other-site.com/floor-plans">Other</a> <a href="/floor-plans#studio">dup</a>`;

describe('discoverSubpages', () => {
  it('finds same-domain pricing/floor-plan links, deduped, capped at 4', () => {
    const urls = discoverSubpages(page, 'https://x01oncampus.com/');
    expect(urls).toEqual([
      'https://x01oncampus.com/floor-plans',
      'https://x01oncampus.com/floorplans/2br',
      'https://x01oncampus.com/pricing',
    ]);
  });

  it('excludes cross-domain links', () => {
    const urls = discoverSubpages(page, 'https://x01oncampus.com/');
    expect(urls.every((u) => u.startsWith('https://x01oncampus.com'))).toBe(true);
  });

  it('deduplicates by stripping fragments', () => {
    const html = '<a href="/floor-plans">FP</a><a href="/floor-plans#studio">Studio</a>';
    const urls = discoverSubpages(html, 'https://example.com/');
    const floorPlanCount = urls.filter((u) => u === 'https://example.com/floor-plans').length;
    expect(floorPlanCount).toBe(1);
  });

  it('caps at 4 results', () => {
    const html = '<a href="/floor-plans">FP</a><a href="/pricing">P</a><a href="/availability">A</a><a href="/rates">R</a><a href="/units">U</a>';
    const urls = discoverSubpages(html, 'https://example.com/');
    expect(urls.length).toBeLessThanOrEqual(4);
  });

  it('handles empty HTML without throwing', () => {
    expect(() => discoverSubpages('', 'https://example.com/')).not.toThrow();
  });

  it('completes well under 1s on a 512KB href-flood input (regex-DoS guard)', () => {
    // 512KB of text with many non-matching href-like strings.
    // The guard distinguishes a LINEAR scan (low hundreds of ms even on a slow,
    // noisy CI runner) from catastrophic backtracking (seconds-to-minutes). The
    // 1s bound is deliberately loose to avoid hardware-variance flakiness while
    // still failing hard on any super-linear regression.
    const flood = '<a href="/about">About</a>'.repeat(20_000) + '<a href="/pricing">P</a>';
    const start = Date.now();
    const urls = discoverSubpages(flood, 'https://example.com/');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(urls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// isHousingRelated
// ---------------------------------------------------------------------------

describe('isHousingRelated', () => {
  it('accepts pages with housing signals — price pattern', () => {
    expect(isHousingRelated('2 Bed / 2 Bath from $1,450 per installment. 850 sq ft. Lease today!', {})).toBe(true);
  });

  it('accepts pages with housing fields present', () => {
    expect(isHousingRelated('no text but fields say so', { rent: 1200 })).toBe(true);
  });

  it('accepts pages with bed/bath terms', () => {
    expect(isHousingRelated('Available 2 bedroom unit, great location', {})).toBe(true);
  });

  it('discards career/job pages — leasing alone is not enough', () => {
    expect(isHousingRelated('Join our team! We are hiring a leasing consultant. Benefits include health insurance and PTO.', {})).toBe(false);
  });

  it('discards blog/informational pages', () => {
    expect(isHousingRelated('Read our blog: 5 tips for studying during finals week', {})).toBe(false);
  });

  it('accepts pages with apartment housing noun + rent signal (2 classes)', () => {
    // 'apartment' triggers housing_noun class; 'rent from $950' triggers BOTH price and housing_noun —
    // two distinct signal classes (price + housing_noun) → true.
    expect(isHousingRelated('Beautiful apartment complex near campus. Rent from $950/mo. Move-in ready!', {})).toBe(true);
  });

  it('handles empty text without throwing', () => {
    expect(() => isHousingRelated('', {})).not.toThrow();
    expect(isHousingRelated('', {})).toBe(false);
  });
});
