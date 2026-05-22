/**
 * Output normalization tests (AIN-38 MEDIUM #1-#4).
 *
 * Covers:
 *   - Length caps on string fields
 *   - Array caps on photos / amenities
 *   - Scheme allowlist on photo URLs (drops `javascript:`, `data:`, etc.)
 *   - lat/lng range validation (drops both axes when either is out-of-range)
 *   - available_from normalised via Date.parse → ISO 8601, dropped on fail
 */

import { describe, it, expect } from 'vitest';

import { LIMITS, filterHttpUrls, normalizeFields } from '../normalize';

describe('filterHttpUrls', () => {
  it('keeps http and https URLs', () => {
    expect(filterHttpUrls(['http://a.example/x.jpg', 'https://b.example/y.jpg'])).toEqual([
      'http://a.example/x.jpg',
      'https://b.example/y.jpg',
    ]);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.com/x.jpg',
    'about:blank',
  ])('drops %s', (url) => {
    expect(filterHttpUrls([url])).toEqual([]);
  });

  it('drops malformed URLs without throwing', () => {
    expect(filterHttpUrls(['not a url', 'https://ok.example/a.jpg'])).toEqual([
      'https://ok.example/a.jpg',
    ]);
  });

  it('preserves order while filtering', () => {
    const input = [
      'javascript:alert(1)',
      'https://a.example/1.jpg',
      'data:text/html,<x/>',
      'https://a.example/2.jpg',
    ];
    expect(filterHttpUrls(input)).toEqual(['https://a.example/1.jpg', 'https://a.example/2.jpg']);
  });
});

describe('normalizeFields — length caps', () => {
  it('truncates title at 500 chars', () => {
    const title = 'A'.repeat(1000);
    const out = normalizeFields({ title });
    expect(out.title).toHaveLength(LIMITS.TITLE_MAX);
    expect(out.title).toBe('A'.repeat(LIMITS.TITLE_MAX));
  });

  it('truncates description at 10000 chars', () => {
    const description = 'B'.repeat(20_000);
    const out = normalizeFields({ description });
    expect(out.description).toHaveLength(LIMITS.DESCRIPTION_MAX);
  });

  it('truncates address at 500 chars', () => {
    const address = 'C'.repeat(2000);
    const out = normalizeFields({ address });
    expect(out.address).toHaveLength(LIMITS.ADDRESS_MAX);
  });

  it('truncates each amenity at 200 chars', () => {
    const amenities = ['Z'.repeat(500), 'short amenity'];
    const out = normalizeFields({ amenities });
    expect(out.amenities?.[0]).toHaveLength(LIMITS.AMENITY_MAX);
    expect(out.amenities?.[1]).toBe('short amenity');
  });

  it('leaves short strings alone', () => {
    const out = normalizeFields({ title: 'Cozy 2BR' });
    expect(out.title).toBe('Cozy 2BR');
  });
});

describe('normalizeFields — array caps', () => {
  it('caps photos at 30', () => {
    const photos = Array.from({ length: 100 }, (_, i) => `https://e.example/${i}.jpg`);
    const out = normalizeFields({ photos });
    expect(out.photos).toHaveLength(LIMITS.PHOTOS_MAX);
    // Slice preserves insertion order — first 30 stay.
    expect(out.photos?.[0]).toBe('https://e.example/0.jpg');
    expect(out.photos?.[29]).toBe('https://e.example/29.jpg');
  });

  it('caps amenities at 50', () => {
    const amenities = Array.from({ length: 80 }, (_, i) => `Amenity ${i}`);
    const out = normalizeFields({ amenities });
    expect(out.amenities).toHaveLength(LIMITS.AMENITIES_MAX);
  });

  it('drops the photos array entirely when every URL has a disallowed scheme', () => {
    const out = normalizeFields({ photos: ['javascript:alert(1)', 'data:text/html,<x/>'] });
    expect(out.photos).toBeUndefined();
  });
});

describe('normalizeFields — geo range validation', () => {
  it('drops both axes when latitude is out of range', () => {
    const out = normalizeFields({ latitude: 12345, longitude: -89.38 });
    expect(out.latitude).toBeUndefined();
    expect(out.longitude).toBeUndefined();
  });

  it('drops both axes when longitude is out of range', () => {
    const out = normalizeFields({ latitude: 43.07, longitude: -99999 });
    expect(out.latitude).toBeUndefined();
    expect(out.longitude).toBeUndefined();
  });

  it('drops both axes when only one is provided', () => {
    const out = normalizeFields({ latitude: 43.07 });
    expect(out.latitude).toBeUndefined();
    expect(out.longitude).toBeUndefined();
  });

  it('keeps coords on the boundary', () => {
    const out = normalizeFields({ latitude: 90, longitude: -180 });
    expect(out.latitude).toBe(90);
    expect(out.longitude).toBe(-180);
  });

  it('keeps normal coords', () => {
    const out = normalizeFields({ latitude: 43.07, longitude: -89.38 });
    expect(out.latitude).toBeCloseTo(43.07);
    expect(out.longitude).toBeCloseTo(-89.38);
  });

  it('drops NaN coords', () => {
    const out = normalizeFields({ latitude: NaN, longitude: NaN });
    expect(out.latitude).toBeUndefined();
    expect(out.longitude).toBeUndefined();
  });
});

describe('normalizeFields — available_from date validation', () => {
  it('normalises a valid ISO date to ISO 8601', () => {
    const out = normalizeFields({ available_from: '2026-08-15' });
    expect(out.available_from).toBe('2026-08-15T00:00:00.000Z');
  });

  it('normalises a valid full timestamp', () => {
    const out = normalizeFields({ available_from: '2026-08-15T12:34:56Z' });
    expect(out.available_from).toBe('2026-08-15T12:34:56.000Z');
  });

  it('drops a garbage date string', () => {
    const out = normalizeFields({ available_from: 'not a date' });
    expect(out.available_from).toBeUndefined();
  });

  it('drops empty string', () => {
    const out = normalizeFields({ available_from: '' });
    expect(out.available_from).toBeUndefined();
  });
});

describe('normalizeFields — overall', () => {
  it('returns a NEW object (immutability)', () => {
    const input = { title: 'X', photos: ['https://e.example/a.jpg'] };
    const out = normalizeFields(input);
    expect(out).not.toBe(input);
    expect(out.photos).not.toBe(input.photos);
  });

  it('drops empty arrays', () => {
    const out = normalizeFields({ photos: [], amenities: [] });
    expect(out.photos).toBeUndefined();
    expect(out.amenities).toBeUndefined();
  });

  it('preserves raw_json_ld and raw_og pass-through', () => {
    const raw_json_ld = { '@type': 'Apartment' };
    const raw_og = { 'og:title': 'X' };
    const out = normalizeFields({ raw_json_ld, raw_og });
    expect(out.raw_json_ld).toBe(raw_json_ld);
    expect(out.raw_og).toBe(raw_og);
  });

  it('drops non-finite numeric fields', () => {
    const out = normalizeFields({ price: Infinity, bedrooms: NaN });
    expect(out.price).toBeUndefined();
    expect(out.bedrooms).toBeUndefined();
  });
});
