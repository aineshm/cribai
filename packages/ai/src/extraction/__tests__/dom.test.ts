/**
 * Unit tests for the Layer-3 per-site DOM fallback extractors (AIN-47,
 * Days 5-6).
 *
 * Each site has a dedicated `SiteExtractor` keyed off `deriveSourceDomain`
 * output (`zillow.com`, `trulia.com`, `realtor.com`, `apartments.com`,
 * `facebook.com`). The dispatcher `extractFromDom` selects one by domain.
 *
 * Test strategy (mirrors `extraction.test.ts`):
 *   - scenario-3 fixture (`-nextdata` / `-dom`): the DOM layer extracts the
 *     listing — assert the fields come out.
 *   - scenario-4 fixture (`-llm`): the DOM layer returns a PARTIAL that fails
 *     the orchestrator's `price && (bedrooms || address)` gate, so Task 3
 *     escalates to the LLM rare path. We assert the partial is missing the
 *     fields that gate would require.
 *   - unknown domain → `{}`.
 *   - malformed `__NEXT_DATA__` → `{}` (graceful degradation, never throws).
 *
 * Extractors return RAW partials (no normalization — that's the orchestrator's
 * job), so assertions are on the raw extracted values.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { extractFromDom, extractNextData } from '../dom';
import { extractZillow } from '../sites/zillow';
import { extractTrulia } from '../sites/trulia';
import { extractRealtor } from '../sites/realtor';
import { extractApartmentsCom } from '../sites/apartments-com';
import { extractFacebook } from '../sites/facebook';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

async function loadFixture(name: string): Promise<string> {
  return await readFile(join(FIXTURES_DIR, name), 'utf8');
}

// ===========================================================================
// extractNextData (shared helper)
// ===========================================================================

describe('extractNextData', () => {
  it('parses a valid __NEXT_DATA__ blob', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{"props":{"x":1}}</script>`;
    const data = extractNextData(html) as { props: { x: number } } | null;
    expect(data?.props.x).toBe(1);
  });

  it('returns null when the blob is absent', () => {
    expect(extractNextData('<html><body>no next data</body></html>')).toBeNull();
  });

  it('returns null on malformed JSON (never throws)', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{not valid json}</script>`;
    expect(() => extractNextData(html)).not.toThrow();
    expect(extractNextData(html)).toBeNull();
  });

  it('scrubs __proto__ to prevent prototype pollution', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{"__proto__":{"polluted":true},"ok":1}</script>`;
    const data = extractNextData(html) as Record<string, unknown> | null;
    expect(data).not.toBeNull();
    // The own `__proto__` key must be dropped at parse time.
    expect(Object.prototype.hasOwnProperty.call(data, '__proto__')).toBe(false);
    expect((data as Record<string, unknown>).ok).toBe(1);
    // Object.prototype must remain unpolluted.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('tolerates attribute order and single quotes on the script tag', () => {
    const html = `<script type='application/json' id='__NEXT_DATA__'>{"props":{"y":2}}</script>`;
    const data = extractNextData(html) as { props: { y: number } } | null;
    expect(data?.props.y).toBe(2);
  });
});

// ===========================================================================
// Zillow
// ===========================================================================

describe('Zillow DOM extractor', () => {
  it('extracts from __NEXT_DATA__ (scenario 3)', async () => {
    const html = await loadFixture('zillow-nextdata.html');
    const url = 'https://www.zillow.com/homedetails/410-W-Dayton-St-Madison-WI-53703/67890_zpid/';
    const fields = extractZillow(html, url);
    expect(fields.price).toBe(2100);
    expect(fields.bedrooms).toBe(3);
    expect(fields.bathrooms).toBe(2);
    expect(fields.square_feet).toBe(1200);
    expect(fields.address).toBe('410 W Dayton St');
    expect(fields.city).toBe('Madison');
    expect(fields.state).toBe('WI');
    expect(fields.zip).toBe('53703');
    expect(fields.latitude).toBeCloseTo(43.0705, 4);
    expect(fields.longitude).toBeCloseTo(-89.3958, 4);
    expect(fields.description).toContain('engineering campus');
    expect(fields.photos).toEqual([
      'https://photos.zillowstatic.com/fp/dayton-1.jpg',
      'https://photos.zillowstatic.com/fp/dayton-2.jpg',
    ]);
  });

  it('dispatches via extractFromDom on zillow.com', async () => {
    const html = await loadFixture('zillow-nextdata.html');
    const url = 'https://www.zillow.com/homedetails/410-W-Dayton-St-Madison-WI-53703/67890_zpid/';
    const fields = extractFromDom(html, url, 'zillow.com');
    expect(fields.price).toBe(2100);
    expect(fields.address).toBe('410 W Dayton St');
  });

  it('returns a partial missing the gate fields on the sparse fixture (scenario 4)', async () => {
    const html = await loadFixture('zillow-llm.html');
    const url = 'https://www.zillow.com/homedetails/sparse/0_zpid/';
    const fields = extractZillow(html, url);
    // Labeled DOM exposes only a bed count — no price → fails
    // `price && (bedrooms || address)` on the price axis.
    expect(fields.bedrooms).toBe(1);
    expect(fields.price).toBeUndefined();
    expect(fields.address).toBeUndefined();
  });

  it('returns {} on malformed __NEXT_DATA__ (no throw)', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{broken</script>`;
    const url = 'https://www.zillow.com/x';
    expect(() => extractZillow(html, url)).not.toThrow();
    expect(extractZillow(html, url)).toEqual({});
  });
});

// ===========================================================================
// Trulia
// ===========================================================================

describe('Trulia DOM extractor', () => {
  it('extracts from __NEXT_DATA__ (scenario 3)', async () => {
    const html = await loadFixture('trulia-nextdata.html');
    const url = 'https://www.trulia.com/p/wi/madison/1418-regent-st-madison-wi-53711';
    const fields = extractTrulia(html, url);
    expect(fields.price).toBe(1650);
    expect(fields.bedrooms).toBe(2);
    expect(fields.bathrooms).toBe(1);
    expect(fields.square_feet).toBe(780);
    expect(fields.address).toBe('1418 Regent St');
    expect(fields.city).toBe('Madison');
    expect(fields.state).toBe('WI');
    expect(fields.zip).toBe('53711');
    expect(fields.latitude).toBeCloseTo(43.0688, 4);
    expect(fields.longitude).toBeCloseTo(-89.4127, 4);
    expect(fields.description).toContain('Regent Street');
    expect(fields.photos).toEqual([
      'https://www.trulia.com/pictures/thumbs/regent-1.jpg',
      'https://www.trulia.com/pictures/thumbs/regent-2.jpg',
    ]);
  });

  it('dispatches via extractFromDom on trulia.com', async () => {
    const html = await loadFixture('trulia-nextdata.html');
    const url = 'https://www.trulia.com/p/wi/madison/1418-regent-st-madison-wi-53711';
    const fields = extractFromDom(html, url, 'trulia.com');
    expect(fields.price).toBe(1650);
    expect(fields.address).toBe('1418 Regent St');
  });

  it('returns a partial missing the gate fields on the sparse fixture (scenario 4)', async () => {
    const html = await loadFixture('trulia-llm.html');
    const url = 'https://www.trulia.com/p/wi/madison/sparse';
    const fields = extractTrulia(html, url);
    // Labeled DOM exposes only an address (no price token) → fails the gate
    // on the price axis.
    expect(fields.address).toBe('2210 University Ave, Madison, WI 53726');
    expect(fields.price).toBeUndefined();
    expect(fields.bedrooms).toBeUndefined();
  });

  it('returns {} on malformed __NEXT_DATA__ (no throw)', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{broken</script>`;
    const url = 'https://www.trulia.com/x';
    expect(extractTrulia(html, url)).toEqual({});
  });
});

// ===========================================================================
// Realtor
// ===========================================================================

describe('Realtor DOM extractor', () => {
  it('extracts from __NEXT_DATA__ (scenario 3)', async () => {
    const html = await loadFixture('realtor-nextdata.html');
    const url = 'https://www.realtor.com/realestateandhomes-detail/14-N-Carroll-St_Madison_WI_53703_M99999';
    const fields = extractRealtor(html, url);
    expect(fields.price).toBe(2850);
    expect(fields.bedrooms).toBe(4);
    expect(fields.bathrooms).toBe(3);
    expect(fields.square_feet).toBe(1600);
    expect(fields.address).toBe('14 N Carroll St');
    expect(fields.city).toBe('Madison');
    expect(fields.state).toBe('WI');
    expect(fields.zip).toBe('53703');
    expect(fields.latitude).toBeCloseTo(43.0759, 4);
    expect(fields.longitude).toBeCloseTo(-89.3845, 4);
    expect(fields.description).toContain('townhouse');
    expect(fields.photos).toEqual([
      'https://ap.rdcpix.com/bbb/carroll-1.jpg',
      'https://ap.rdcpix.com/bbb/carroll-2.jpg',
    ]);
  });

  it('dispatches via extractFromDom on realtor.com', async () => {
    const html = await loadFixture('realtor-nextdata.html');
    const url = 'https://www.realtor.com/realestateandhomes-detail/14-N-Carroll-St_Madison_WI_53703_M99999';
    const fields = extractFromDom(html, url, 'realtor.com');
    expect(fields.price).toBe(2850);
    expect(fields.address).toBe('14 N Carroll St');
  });

  it('returns a partial missing the gate fields on the sparse fixture (scenario 4)', async () => {
    const html = await loadFixture('realtor-llm.html');
    const url = 'https://www.realtor.com/realestateandhomes-detail/sparse';
    const fields = extractRealtor(html, url);
    // Labeled spans expose bed + bath only → no price, no address.
    expect(fields.bedrooms).toBe(2);
    expect(fields.bathrooms).toBe(1);
    expect(fields.price).toBeUndefined();
    expect(fields.address).toBeUndefined();
  });

  it('returns {} on malformed __NEXT_DATA__ (no throw)', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{broken</script>`;
    const url = 'https://www.realtor.com/x';
    expect(extractRealtor(html, url)).toEqual({});
  });
});

// ===========================================================================
// Apartments.com
// ===========================================================================

describe('Apartments.com DOM extractor', () => {
  it('extracts from labeled DOM + window.__data (scenario 3)', async () => {
    const html = await loadFixture('apartments-com-dom.html');
    const url = 'https://www.apartments.com/lucky-apartments-madison-wi/abc/';
    const fields = extractApartmentsCom(html, url);
    expect(fields.price).toBe(1895);
    expect(fields.bedrooms).toBe(2);
    expect(fields.bathrooms).toBe(1);
    expect(fields.square_feet).toBe(720);
    expect(fields.address).toBe('315 N Frances St');
    expect(fields.city).toBe('Madison');
    expect(fields.state).toBe('WI');
    expect(fields.zip).toBe('53703');
    expect(fields.photos).toEqual(['https://images1.apartments.com/i2/lucky/exterior.jpg']);
  });

  it('dispatches via extractFromDom on apartments.com', async () => {
    const html = await loadFixture('apartments-com-dom.html');
    const url = 'https://www.apartments.com/lucky-apartments-madison-wi/abc/';
    const fields = extractFromDom(html, url, 'apartments.com');
    expect(fields.price).toBe(1895);
    expect(fields.address).toBe('315 N Frances St');
  });

  it('returns a partial missing the gate fields on the sparse fixture (scenario 4)', async () => {
    const html = await loadFixture('apartments-com-llm.html');
    const url = 'https://www.apartments.com/riverside-flats-madison-wi/xyz/';
    const fields = extractApartmentsCom(html, url);
    // Beds + baths only, no rent, no window.__data → no price, no address.
    expect(fields.bedrooms).toBe(3);
    expect(fields.bathrooms).toBe(2);
    expect(fields.price).toBeUndefined();
    expect(fields.address).toBeUndefined();
  });
});

// ===========================================================================
// Facebook
// ===========================================================================

describe('Facebook DOM extractor', () => {
  it('extracts from the ScheduledServerJS blob (scenario 3)', async () => {
    const html = await loadFixture('facebook-nextdata.html');
    const url = 'https://www.facebook.com/marketplace/item/123/';
    const fields = extractFacebook(html, url);
    expect(fields.title).toBe('2BR Sublease near Camp Randall');
    expect(fields.price).toBe(1500);
    expect(fields.description).toContain('Camp Randall');
    expect(fields.photos).toEqual([
      'https://scontent.fbcdn.net/v/fb-sublease-1.jpg',
      'https://scontent.fbcdn.net/v/fb-sublease-2.jpg',
    ]);
  });

  it('dispatches via extractFromDom on facebook.com', async () => {
    const html = await loadFixture('facebook-nextdata.html');
    const url = 'https://www.facebook.com/marketplace/item/123/';
    const fields = extractFromDom(html, url, 'facebook.com');
    expect(fields.price).toBe(1500);
    expect(fields.title).toBe('2BR Sublease near Camp Randall');
  });

  it('returns a partial missing the gate fields on the sparse fixture (scenario 4)', async () => {
    const html = await loadFixture('facebook-llm.html');
    const url = 'https://www.facebook.com/marketplace/item/456/';
    const fields = extractFacebook(html, url);
    // Blob carries only a title + photo → no price, no address, no beds.
    expect(fields.title).toContain('Room available');
    expect(fields.price).toBeUndefined();
    expect(fields.address).toBeUndefined();
    expect(fields.bedrooms).toBeUndefined();
  });

  it('returns {} when there is no extractable blob (login wall)', async () => {
    const html = await loadFixture('facebook-blocked.html');
    const url = 'https://www.facebook.com/marketplace/item/789/';
    expect(extractFacebook(html, url)).toEqual({});
  });
});

// ===========================================================================
// Dispatcher edge cases
// ===========================================================================

describe('extractFromDom dispatcher', () => {
  it('returns {} for an unknown domain', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>`;
    expect(extractFromDom(html, 'https://example.com/x', 'example.com')).toEqual({});
  });

  it('returns {} when the matched extractor finds nothing', () => {
    expect(extractFromDom('<html><body>nothing</body></html>', 'https://www.zillow.com/x', 'zillow.com')).toEqual({});
  });

  it('never throws even when an extractor would hit malformed data', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{broken</script>`;
    expect(() => extractFromDom(html, 'https://www.zillow.com/x', 'zillow.com')).not.toThrow();
    expect(extractFromDom(html, 'https://www.zillow.com/x', 'zillow.com')).toEqual({});
  });
});
