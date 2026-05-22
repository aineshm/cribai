/**
 * Unit tests for the listing extraction service (AIN-13 Days 3-4).
 *
 * Uses fixture HTML files (`__fixtures__/`) to exercise the JSON-LD primary
 * path, the OpenGraph fallback path, the merge logic, and the error paths.
 *
 * Live network fetches are gated behind `E2E_LIVE_EXTRACTION=1` and skipped
 * in the standard CI run.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  extractListing,
  ExtractionError,
  parseAllJsonLdBlocks,
  parseMetaTags,
  decodeHtmlEntities,
  extractFromJsonLd,
  extractFromOg,
} from '../index';
import { projectJsonLdEntity, findListingEntitiesBfs } from '../json-ld';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

/**
 * Build a fake `fetch` that returns the given fixture HTML for the given URL.
 * Throws if the test asks for an unexpected URL — keeps mistakes loud.
 */
function makeFixtureFetcher(map: Record<string, { body: string; status?: number }>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const hit = map[url];
    if (!hit) throw new Error(`Test fetcher: unexpected URL ${url}`);
    return new Response(hit.body, { status: hit.status ?? 200 });
  }) as typeof fetch;
}

async function loadFixture(name: string): Promise<string> {
  return await readFile(join(FIXTURES_DIR, name), 'utf8');
}

// ===========================================================================
// JSON-LD primary path
// ===========================================================================

describe('JSON-LD primary path', () => {
  it('extracts full Zillow listing with high confidence', async () => {
    const html = await loadFixture('zillow.html');
    const url = 'https://www.zillow.com/homedetails/123-W-Gorham-St-APT-3-Madison-WI-53703/12345_zpid/';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });

    expect(result.source_url).toBe(url);
    expect(result.source_domain).toBe('zillow.com');
    expect(result.title).toBe('123 W Gorham St APT 3');
    expect(result.description).toContain('Cozy 2BR');
    // JSON-LD strings are NOT HTML-decoded — they're JSON text, not HTML attrs.
    // The fixture has a literal `&amp;` inside the JSON-LD description; we
    // intentionally preserve it verbatim. OG paths (below) do decode entities.
    expect(result.description).toContain('Heat &amp; water');
    expect(result.price).toBe(1950);
    expect(result.bedrooms).toBe(2);
    expect(result.bathrooms).toBe(1);
    expect(result.square_feet).toBe(850);
    expect(result.address).toBe('123 W Gorham St APT 3');
    expect(result.city).toBe('Madison');
    expect(result.state).toBe('WI');
    expect(result.zip).toBe('53703');
    expect(result.latitude).toBeCloseTo(43.0747, 4);
    expect(result.longitude).toBeCloseTo(-89.3839, 4);
    expect(result.photos).toEqual([
      'https://photos.zillowstatic.com/fp/abc-uncropped_scaled.jpg',
      'https://photos.zillowstatic.com/fp/abc-2.jpg',
    ]);
    expect(result.amenities).toEqual(['In-unit laundry', 'Dishwasher']); // pool=false dropped
    expect(result.available_from).toBe('2026-08-15');
    expect(result.extraction_method).toBe('json_ld');
    expect(result.extraction_confidence).toBe('high');
    expect(result.raw_json_ld).toBeDefined();
  });

  it('handles @graph wrapper from Apartments.com', async () => {
    const html = await loadFixture('apartments-com.html');
    const url = 'https://www.apartments.com/the-hub-at-madison-madison-wi/abc123/';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });

    expect(result.source_domain).toBe('apartments.com');
    expect(result.title).toBe('The Hub at Madison');
    expect(result.price).toBe(2150); // priceSpecification nested
    expect(result.bedrooms).toBe(3);
    expect(result.bathrooms).toBe(2);
    expect(result.square_feet).toBe(1100); // unitText "sqft"
    expect(result.address).toBe('437 N Frances St');
    expect(result.latitude).toBeCloseTo(43.0738, 4); // numeric string coerced
    expect(result.longitude).toBeCloseTo(-89.3992, 4);
    // Image was a single relative string — should resolve against URL.
    expect(result.photos).toEqual(['https://www.apartments.com/images/hub/exterior.jpg']);
    // Amenity with no `value` key still counts (presence implies true)
    expect(result.amenities).toEqual(['Fitness Center', 'Rooftop Pool']);
    expect(result.extraction_method).toBe('json_ld');
    expect(result.extraction_confidence).toBe('high');
  });

  it('handles Realtor.com with multiple JSON-LD blocks and ImageObject array', async () => {
    const html = await loadFixture('realtor.html');
    const url = 'https://www.realtor.com/realestateandhomes-detail/522-State-St_Madison_WI_53703_M12345';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });

    expect(result.source_domain).toBe('realtor.com');
    expect(result.title).toBe('522 State St');
    expect(result.description).toContain('cafes'); // JSON-LD strings preserved
    expect(result.price).toBe(3200);
    expect(result.bedrooms).toBe(4); // numberOfBedrooms on SingleFamilyResidence
    expect(result.bathrooms).toBe(2.5);
    expect(result.square_feet).toBe(1850);
    expect(result.photos).toEqual([
      'https://ap.rdcpix.com/aaa/exterior.jpg',
      'https://ap.rdcpix.com/aaa/living.jpg',
    ]);
    expect(result.amenities).toEqual(['Garage', 'Hardwood Floors', 'Central Air']);
    expect(result.extraction_confidence).toBe('high');
  });
});

// ===========================================================================
// OpenGraph fallback path
// ===========================================================================

describe('OpenGraph fallback path', () => {
  it('falls back to OG when no JSON-LD is present (low confidence per spec)', async () => {
    // Fixture #4 in the task spec: "A site with ONLY OpenGraph — verify
    // fallback works, returns 'low' confidence". This fixture intentionally
    // omits price so the OG-only path produces a sparse result.
    const html = await loadFixture('og-only.html');
    const url = 'https://www.facebook.com/marketplace/item/abc123/';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });

    expect(result.source_domain).toBe('facebook.com');
    expect(result.title).toBe('2BR Sublease near UW Campus');
    expect(result.description).toContain('Heat & water'); // entity decoded in OG path
    expect(result.photos).toEqual([
      'https://www.facebook.com/images/sublease/photo1.jpg',
      'https://www.facebook.com/images/sublease/photo2.jpg',
    ]);
    expect(result.extraction_method).toBe('og');
    expect(result.extraction_confidence).toBe('low');
    expect(result.raw_og).toBeDefined();
    expect(result.raw_og!['og:title']).toBe('2BR Sublease near UW Campus');
    // Fields JSON-LD-only should be undefined
    expect(result.price).toBeUndefined();
    expect(result.bedrooms).toBeUndefined();
    expect(result.address).toBeUndefined();
  });

  it('rich OG (with price) still earns medium confidence', async () => {
    // Separate from fixture #4 — confirms that the confidence-scoring nuance
    // for OG-only with price + title + photos is preserved.
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Rich OG Listing" />
      <meta property="og:image" content="https://example.com/rich.jpg" />
      <meta property="og:price:amount" content="1500" />
    </head><body></body></html>`;
    const url = 'https://example.com/rich-og';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });
    expect(result.extraction_method).toBe('og');
    expect(result.extraction_confidence).toBe('medium');
  });

  it('gracefully degrades to OG when JSON-LD is malformed', async () => {
    const html = await loadFixture('malformed-jsonld.html');
    const url = 'https://example.com/cozy-studio';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });

    expect(result.title).toBe('Cozy Studio Apartment in Madison');
    expect(result.price).toBe(1250);
    expect(result.extraction_method).toBe('og');
    // No address / bedrooms via OG → low confidence
    expect(result.extraction_confidence).toBe('medium'); // price + title + photo → medium
  });

  it('produces og-only low confidence when OG fields are sparse', async () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="A Place" />
    </head><body></body></html>`;
    const url = 'https://example.com/sparse';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });
    expect(result.title).toBe('A Place');
    expect(result.extraction_method).toBe('og');
    expect(result.extraction_confidence).toBe('low');
  });
});

// ===========================================================================
// Merge behavior — JSON-LD + OG
// ===========================================================================

describe('JSON-LD + OG merge', () => {
  it('marks extraction_method as json_ld_plus_og when OG fills a gap', async () => {
    // JSON-LD without description, OG provides it.
    const html = `<!doctype html><html><head>
      <meta property="og:description" content="OG-only description text." />
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Apartment","name":"Test Apt",
       "address":{"@type":"PostalAddress","streetAddress":"1 Main St","addressLocality":"Madison","addressRegion":"WI","postalCode":"53703"},
       "numberOfBedrooms":1,"offers":{"@type":"Offer","price":900,"priceCurrency":"USD"}}
      </script>
    </head><body></body></html>`;
    const url = 'https://example.com/merge-test';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });
    expect(result.extraction_method).toBe('json_ld_plus_og');
    expect(result.description).toBe('OG-only description text.');
    expect(result.title).toBe('Test Apt'); // JSON-LD wins
    expect(result.extraction_confidence).toBe('high'); // price + address + bedrooms all present
  });

  it('JSON-LD takes precedence over OG on shared fields', async () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="OG title" />
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Apartment","name":"JSON-LD title",
       "offers":{"@type":"Offer","price":1000}}
      </script>
    </head><body></body></html>`;
    const url = 'https://example.com/precedence';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });
    expect(result.title).toBe('JSON-LD title');
    // OG didn't fill any gap, so method stays json_ld (raw_og still attached as debug)
    expect(result.extraction_method).toBe('json_ld');
    expect(result.raw_og).toBeDefined();
  });
});

// ===========================================================================
// Error paths
// ===========================================================================

describe('error paths', () => {
  it('throws no_listing_data when neither path produces anything', async () => {
    const html = await loadFixture('no-structured-data.html');
    const url = 'https://example.com/empty';
    await expect(
      extractListing(url, {
        fetcher: makeFixtureFetcher({ [url]: { body: html } }),
      }),
    ).rejects.toMatchObject({
      name: 'ExtractionError',
      code: 'no_listing_data',
    });
  });

  it('throws parse_failed on invalid URL', async () => {
    await expect(extractListing('not a url')).rejects.toMatchObject({
      name: 'ExtractionError',
      code: 'parse_failed',
    });
  });

  it('throws parse_failed on unsupported scheme', async () => {
    await expect(extractListing('ftp://example.com/foo')).rejects.toMatchObject({
      code: 'parse_failed',
    });
  });

  it('throws fetch_failed on network error', async () => {
    const url = 'https://example.com/will-fail';
    const fetcher = (async () => {
      throw new Error('socket hang up');
    }) as typeof fetch;
    await expect(extractListing(url, { fetcher })).rejects.toMatchObject({
      code: 'fetch_failed',
    });
  });

  it('throws fetch_blocked on 403', async () => {
    const url = 'https://example.com/blocked';
    const fetcher = makeFixtureFetcher({ [url]: { body: 'nope', status: 403 } });
    await expect(extractListing(url, { fetcher })).rejects.toMatchObject({
      code: 'fetch_blocked',
    });
  });

  it('throws fetch_blocked on 429', async () => {
    const url = 'https://example.com/throttled';
    const fetcher = makeFixtureFetcher({ [url]: { body: 'nope', status: 429 } });
    await expect(extractListing(url, { fetcher })).rejects.toMatchObject({
      code: 'fetch_blocked',
    });
  });

  it('throws fetch_failed on 404', async () => {
    const url = 'https://example.com/missing';
    const fetcher = makeFixtureFetcher({ [url]: { body: 'nope', status: 404 } });
    await expect(extractListing(url, { fetcher })).rejects.toMatchObject({
      code: 'fetch_failed',
    });
  });

  it('throws fetch_blocked when body has a captcha signal', async () => {
    const url = 'https://example.com/captcha';
    const fetcher = makeFixtureFetcher({
      [url]: { body: '<html><body>Please verify you are human</body></html>' },
    });
    await expect(extractListing(url, { fetcher })).rejects.toMatchObject({
      code: 'fetch_blocked',
    });
  });

  it('honours fetch timeout via AbortController', async () => {
    const url = 'https://example.com/slow';
    const fetcher = ((_, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    }) as typeof fetch;
    await expect(
      extractListing(url, { fetcher, timeoutMs: 10 }),
    ).rejects.toMatchObject({ code: 'fetch_failed' });
  });

  it('ExtractionError carries the original cause', () => {
    const cause = new Error('inner');
    const err = new ExtractionError('fetch_failed', 'wrapped', 'https://example.com', cause);
    expect(err.code).toBe('fetch_failed');
    expect(err.url).toBe('https://example.com');
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('ExtractionError');
  });
});

// ===========================================================================
// Unit helpers
// ===========================================================================

describe('parseAllJsonLdBlocks', () => {
  it('parses multiple blocks and skips malformed ones', () => {
    const html = `
      <script type="application/ld+json">{"a":1}</script>
      <script type="application/ld+json">not json</script>
      <script type="application/ld+json">{"b":2}</script>
    `;
    expect(parseAllJsonLdBlocks(html)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('ignores empty bodies', () => {
    const html = `<script type="application/ld+json">  </script>`;
    expect(parseAllJsonLdBlocks(html)).toEqual([]);
  });

  it('tolerates single quotes and attribute order in the script tag', () => {
    const html = `<script data-foo="bar" type='application/ld+json'>{"x":1}</script>`;
    expect(parseAllJsonLdBlocks(html)).toEqual([{ x: 1 }]);
  });
});

describe('parseMetaTags', () => {
  it('captures property and name attributes', () => {
    const html = `
      <meta property="og:title" content="A" />
      <meta name="twitter:title" content="B" />
    `;
    const { single } = parseMetaTags(html);
    expect(single['og:title']).toBe('A');
    expect(single['twitter:title']).toBe('B');
  });

  it('collects multi-valued og:image into multi', () => {
    const html = `
      <meta property="og:image" content="https://a.example/1.jpg" />
      <meta property="og:image" content="https://a.example/2.jpg" />
    `;
    const { multi } = parseMetaTags(html);
    expect(multi['og:image']).toEqual(['https://a.example/1.jpg', 'https://a.example/2.jpg']);
  });

  it('decodes entities in content', () => {
    const html = `<meta property="og:title" content="A &amp; B &#39;C&#39;" />`;
    const { single } = parseMetaTags(html);
    expect(single['og:title']).toBe("A & B 'C'");
  });

  it('ignores meta tags with no content', () => {
    const html = `<meta property="og:title" />`;
    const { single } = parseMetaTags(html);
    expect(single['og:title']).toBeUndefined();
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes named entities', () => {
    expect(decodeHtmlEntities('&amp;|&lt;|&gt;|&quot;|&apos;|&nbsp;')).toBe('&|<|>|"|\'| ');
  });
  it('decodes numeric entities', () => {
    expect(decodeHtmlEntities('&#65; &#x41;')).toBe('A A');
  });
  it('handles &amp; without double-decoding', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
  });

  // Codex round 5: out-of-range numeric character references must not throw.
  // `String.fromCodePoint(999999999)` raises `RangeError` natively; one bad
  // entity in third-party HTML should not abort the entire extraction.
  it('passes through invalid decimal numeric entities without throwing', () => {
    expect(() => decodeHtmlEntities('x &#999999999; y')).not.toThrow();
    // Preserve the original token verbatim so callers/debug logs can still see it.
    expect(decodeHtmlEntities('x &#999999999; y')).toBe('x &#999999999; y');
  });

  it('passes through invalid hex numeric entities without throwing', () => {
    expect(() => decodeHtmlEntities('x &#x110000; y')).not.toThrow();
    expect(decodeHtmlEntities('x &#x110000; y')).toBe('x &#x110000; y');
  });

  it('still decodes valid numeric entities alongside invalid ones', () => {
    // The valid &#65; (A) should decode; the invalid one should pass through.
    expect(decodeHtmlEntities('&#65; &#999999999; &#x42;')).toBe('A &#999999999; B');
  });
});

describe('projectJsonLdEntity edge cases', () => {
  it('converts square meters to square feet via unitCode MTK', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        floorSize: { value: 50, unitCode: 'MTK' },
      },
      'https://example.com/x',
    );
    // 50 m² ~= 538 sqft
    expect(projected.square_feet).toBe(538);
  });

  it('handles numeric-string price directly on entity', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Product',
        price: '$1,950.50',
      },
      'https://example.com/x',
    );
    expect(projected.price).toBe(1950.5);
  });

  it('resolves relative image URLs', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        image: ['/photos/a.jpg', '/photos/b.jpg'],
      },
      'https://www.example.com/listing/1',
    );
    expect(projected.photos).toEqual([
      'https://www.example.com/photos/a.jpg',
      'https://www.example.com/photos/b.jpg',
    ]);
  });

  it('extracts amenities from additionalProperty array', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'Pets allowed', value: true },
          { '@type': 'PropertyValue', name: 'Smoking', value: false },
        ],
      },
      'https://example.com/x',
    );
    expect(projected.amenities).toEqual(['Pets allowed']);
  });

  it('handles flat string address', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        address: '1 Main St, Madison, WI',
      },
      'https://example.com/x',
    );
    expect(projected.address).toBe('1 Main St, Madison, WI');
    expect(projected.city).toBeUndefined();
  });

  it('handles @type as array including a listing type', () => {
    // findListingEntities should still pick this up.
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":["Apartment","Residence"],"name":"X"}
    </script>`;
    const result = extractFromJsonLd(html, 'https://example.com/x');
    expect(result).not.toBeNull();
    expect(result?.title).toBe('X');
  });

  it('handles ImageObject with contentUrl', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        image: [{ '@type': 'ImageObject', contentUrl: 'https://example.com/c.jpg' }],
      },
      'https://example.com/x',
    );
    expect(projected.photos).toEqual(['https://example.com/c.jpg']);
  });

  it('handles geo as an array of GeoCoordinates', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        geo: [{ '@type': 'GeoCoordinates', latitude: 43.07, longitude: -89.38 }],
      },
      'https://example.com/x',
    );
    expect(projected.latitude).toBeCloseTo(43.07);
    expect(projected.longitude).toBeCloseTo(-89.38);
  });

  it('handles bedrooms encoded as {value} object', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        numberOfBedrooms: { value: 2 },
      },
      'https://example.com/x',
    );
    expect(projected.bedrooms).toBe(2);
  });

  it('handles bathrooms encoded as {value} object', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        numberOfBathrooms: { value: 1.5 },
      },
      'https://example.com/x',
    );
    expect(projected.bathrooms).toBe(1.5);
  });

  it('falls back to numberOfFullBathrooms when total/numberOfBathrooms absent', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        numberOfFullBathrooms: 2,
      },
      'https://example.com/x',
    );
    expect(projected.bathrooms).toBe(2);
  });

  it('returns undefined floor size when value is non-numeric', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        floorSize: { value: 'not a number' },
      },
      'https://example.com/x',
    );
    expect(projected.square_feet).toBeUndefined();
  });

  it('returns undefined geo when only one axis present', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        geo: { latitude: 43.07 },
      },
      'https://example.com/x',
    );
    expect(projected.latitude).toBeUndefined();
    expect(projected.longitude).toBeUndefined();
  });

  it('handles address as an array of PostalAddress (first element wins)', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        address: [
          { '@type': 'PostalAddress', streetAddress: 'A', addressLocality: 'X' },
          { '@type': 'PostalAddress', streetAddress: 'B', addressLocality: 'Y' },
        ],
      },
      'https://example.com/x',
    );
    expect(projected.address).toBe('A');
    expect(projected.city).toBe('X');
  });
});

// ===========================================================================
// Codex P1/P2 follow-up coverage
// ===========================================================================

describe('codex follow-ups', () => {
  it('recurses into non-@graph containers like WebPage.mainEntity', async () => {
    // Common schema.org layout: a WebPage wraps the actual listing in
    // `mainEntity`. The walker must descend into it.
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"WebPage",
       "mainEntity":{
         "@type":"Apartment",
         "name":"Nested Listing",
         "numberOfBedrooms":1,
         "address":{"@type":"PostalAddress","streetAddress":"1 Main","addressLocality":"Madison","addressRegion":"WI","postalCode":"53703"},
         "offers":{"@type":"Offer","price":1200}
       }}
      </script>
    </head><body></body></html>`;
    const url = 'https://example.com/nested';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });
    expect(result.title).toBe('Nested Listing');
    expect(result.bedrooms).toBe(1);
    expect(result.price).toBe(1200);
    expect(result.extraction_method).toBe('json_ld');
    expect(result.extraction_confidence).toBe('high');
  });

  it('handles ranged rent strings in JSON-LD by taking the lower bound', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'ApartmentComplex',
        name: 'Range Rent Building',
        offers: { '@type': 'Offer', price: '$1,800 - $2,200' },
      },
      'https://example.com/x',
    );
    expect(projected.price).toBe(1800);
  });

  it('handles ranged rent strings in OG og:price:amount', async () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Range OG" />
      <meta property="og:price:amount" content="$1,800 – $2,200" />
    </head><body></body></html>`;
    const url = 'https://example.com/og-range';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });
    expect(result.price).toBe(1800);
  });

  it('handles en-dash range in JSON-LD price', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'ApartmentComplex',
        offers: { '@type': 'Offer', price: '1500–1900' },
      },
      'https://example.com/x',
    );
    expect(projected.price).toBe(1500);
  });

  it('does not map datePosted to available_from', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        datePosted: '2024-01-15',
      },
      'https://example.com/x',
    );
    expect(projected.available_from).toBeUndefined();
  });

  it('still maps availabilityStarts to available_from', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        availabilityStarts: '2026-08-15',
        datePosted: '2024-01-15',
      },
      'https://example.com/x',
    );
    expect(projected.available_from).toBe('2026-08-15');
  });

  it('selects the shallower listing when both a publisher Place and a mainEntity Apartment exist', async () => {
    // Publisher's location is a Place at depth 2; the real listing is an
    // Apartment under mainEntity at depth 1. BFS selects Apartment as the
    // shallower entity, regardless of object key order.
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"WebPage",
       "publisher":{
         "@type":"Organization","name":"Vendor",
         "location":{"@type":"Place","name":"Vendor HQ",
                     "address":{"@type":"PostalAddress","streetAddress":"9 Office Ln","addressLocality":"NYC","addressRegion":"NY","postalCode":"10001"}}
       },
       "mainEntity":{
         "@type":"Apartment","name":"The Real Listing",
         "address":{"@type":"PostalAddress","streetAddress":"1 Main St","addressLocality":"Madison","addressRegion":"WI","postalCode":"53703"},
         "numberOfBedrooms":2,
         "offers":{"@type":"Offer","price":1500}
       }}
      </script>
    </head><body></body></html>`;
    const url = 'https://example.com/wrapper';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });
    expect(result.title).toBe('The Real Listing');
    expect(result.city).toBe('Madison');
    expect(result.bedrooms).toBe(2);
    expect(result.price).toBe(1500);
  });

  it('extracts a top-level Place listing even when nested Apartment children exist (floorplans)', async () => {
    // Real-world layout: a page-level Place (the property) embeds floorplan
    // Apartments as `containsPlace` children. BFS gives the shallower Place
    // priority — the wrapping property is the listing, not the floorplan.
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Place","name":"Main Property",
       "address":{"@type":"PostalAddress","streetAddress":"1 Main St","addressLocality":"Madison","addressRegion":"WI","postalCode":"53703"},
       "containsPlace":[
         {"@type":"Apartment","name":"Unit A","numberOfBedrooms":1,"offers":{"@type":"Offer","price":900}},
         {"@type":"Apartment","name":"Unit B","numberOfBedrooms":2,"offers":{"@type":"Offer","price":1200}}
       ]}
      </script>
    </head><body></body></html>`;
    const url = 'https://example.com/floorplans';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });
    expect(result.title).toBe('Main Property');
    expect(result.city).toBe('Madison');
    // Top-level Place has no bedrooms/price of its own — those are on the
    // sub-units. That's the correct mapping: the page is the property, not
    // a specific unit.
    expect(result.bedrooms).toBeUndefined();
    expect(result.price).toBeUndefined();
  });

  it('still extracts a Place when it is the only listing-shaped entity', async () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Place","name":"Some Place",
       "address":{"@type":"PostalAddress","streetAddress":"5 Side St","addressLocality":"Madison","addressRegion":"WI","postalCode":"53703"}}
      </script>
    </head><body></body></html>`;
    const url = 'https://example.com/place-only';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });
    expect(result.title).toBe('Some Place');
    expect(result.city).toBe('Madison');
  });

  // Vitest test timeout (default 5s) would surface as a fail rather than a hang
  // if the WeakSet visited-guard regressed. JSON.parse can't produce cycles,
  // but a future mutating caller could; the guard ensures we never loop.
  // The cycle goes through two non-listing wrappers so the BFS actually has
  // to revisit a node (the yielded-entity branch `continue`s before queueing
  // sub-keys, so a self-referential listing alone wouldn't exercise the guard).
  it('terminates on a cyclic graph and yields the listing entity once', () => {
    const wrapperA: Record<string, unknown> = {};
    const wrapperB: Record<string, unknown> = { back: wrapperA };
    wrapperA.forward = wrapperB;
    const apt: Record<string, unknown> = { '@type': 'Apartment', name: 'Cyclic Listing' };
    wrapperA.entity = apt;
    const yielded = Array.from(findListingEntitiesBfs(wrapperA));
    expect(yielded).toHaveLength(1);
    expect(yielded[0]).toBe(apt);
  }, 2000);

  it.each([
    ['space-separated', ' '],
    ['NBSP-separated', ' '],
  ])('parses %s thousands in JSON-LD price (locale style)', (_label, sep) => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'Apartment',
        offers: { '@type': 'Offer', price: `1${sep}800` },
      },
      'https://example.com/x',
    );
    expect(projected.price).toBe(1800);
  });

  it('parses NBSP-separated thousands in OG og:price:amount', async () => {
    // The HTML literally contains `1&nbsp;800`. decodeHtmlEntities turns it
    // into a real space; parsePrice must collapse digit-spaces.
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="NBSP price" />
      <meta property="og:price:amount" content="1&nbsp;800" />
    </head><body></body></html>`;
    const url = 'https://example.com/og-nbsp';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });
    expect(result.price).toBe(1800);
  });

  it('still handles ranged space-separated values', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'ApartmentComplex',
        offers: { '@type': 'Offer', price: '1 800 - 2 200' },
      },
      'https://example.com/x',
    );
    // Space between digits collapses; range collapses to lower.
    expect(projected.price).toBe(1800);
  });

  // -------------------------------------------------------------------------
  // Codex round 5 follow-ups
  // -------------------------------------------------------------------------

  it('parses JSON-LD when the script type carries a MIME parameter (charset=utf-8)', () => {
    // Real-world publishers (Next.js, Gatsby, several CMSes) emit the script
    // tag with the full MIME `application/ld+json; charset=utf-8`. The block
    // must still be picked up — otherwise we lose JSON-LD entirely on those
    // pages and silently degrade to OG-only.
    const html = `<!doctype html><html><head>
      <script type="application/ld+json; charset=utf-8">
      {"@context":"https://schema.org","@type":"Apartment","name":"MIME Param Listing",
       "numberOfBedrooms":2,"offers":{"@type":"Offer","price":1750},
       "address":{"@type":"PostalAddress","streetAddress":"7 Spaarne","addressLocality":"Madison","addressRegion":"WI","postalCode":"53703"}}
      </script>
    </head><body></body></html>`;
    const blocks = parseAllJsonLdBlocks(html);
    expect(blocks).toHaveLength(1);
    const extracted = extractFromJsonLd(html, 'https://example.com/mime');
    expect(extracted?.title).toBe('MIME Param Listing');
    expect(extracted?.price).toBe(1750);
  });

  it('extractListing succeeds end-to-end on JSON-LD with MIME parameter', async () => {
    const html = `<!doctype html><html><head>
      <script type='application/ld+json; charset="UTF-8"'>
      {"@context":"https://schema.org","@type":"Apartment","name":"MIME Param E2E",
       "numberOfBedrooms":1,"offers":{"@type":"Offer","price":1100},
       "address":{"@type":"PostalAddress","streetAddress":"8 Spaarne","addressLocality":"Madison","addressRegion":"WI","postalCode":"53703"}}
      </script>
    </head><body></body></html>`;
    const url = 'https://example.com/mime-e2e';
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });
    expect(result.title).toBe('MIME Param E2E');
    expect(result.extraction_method).toBe('json_ld');
    expect(result.extraction_confidence).toBe('high');
  });

  // -------------------------------------------------------------------------
  // Codex round 6 follow-ups
  // -------------------------------------------------------------------------

  it('does NOT use numberOfRooms as a bedroom fallback (schema.org counts total rooms, not bedrooms)', () => {
    // Schema.org `numberOfRooms` is "rooms excluding bathrooms and closets" —
    // a 4-bed house is typically 7+ rooms. Storing rooms as bedrooms would
    // materially over-report; `undefined` is safer than wrong.
    const projected = projectJsonLdEntity(
      {
        '@type': 'SingleFamilyResidence',
        name: 'Big House',
        numberOfRooms: 8,
      },
      'https://example.com/x',
    );
    expect(projected.bedrooms).toBeUndefined();
  });

  it('still extracts bedrooms when numberOfBedrooms is present on SingleFamilyResidence', () => {
    const projected = projectJsonLdEntity(
      {
        '@type': 'SingleFamilyResidence',
        name: 'Correct House',
        numberOfBedrooms: 3,
        numberOfRooms: 8,
      },
      'https://example.com/x',
    );
    expect(projected.bedrooms).toBe(3);
  });

  it('enforces an end-to-end timeout that covers body download, not just headers', async () => {
    // Simulate a publisher that resolves response headers immediately and
    // then never finishes streaming the body. The hard timeout must abort the
    // whole call, not just the initial `fetch()` round-trip.
    const url = 'https://example.com/slow-body';
    const stallingFetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
      // Honour the AbortSignal that `extractListing` wires in. The test fails
      // (timeout) without the fix because `clearTimeout` runs after headers.
      const signal = init?.signal;
      return {
        status: 200,
        ok: true,
        text: () =>
          new Promise((_, reject) => {
            if (signal) {
              if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
              else signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            }
            // Never resolve on its own.
          }),
      } as unknown as Response;
    }) as typeof fetch;

    const start = Date.now();
    await expect(
      extractListing(url, { fetcher: stallingFetcher, timeoutMs: 50 }),
    ).rejects.toMatchObject({ name: 'ExtractionError', code: 'fetch_failed' });
    const elapsed = Date.now() - start;
    // Should abort within a comfortable margin of the 50ms budget. If the
    // timer was cleared after `fetch()`, this would hang indefinitely.
    expect(elapsed).toBeLessThan(1500);
  });

  it('resolves relative image URLs against the final URL after redirect', async () => {
    // Origin responds at the redirected URL with a different host. Relative
    // og:image / image URLs must resolve against the post-redirect URL, not
    // the original request URL.
    const requested = 'https://l.example.com/r/abc';
    const finalUrl = 'https://cdn.publisher.example.com/listing/123';
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Apartment","name":"Redirected Listing",
       "numberOfBedrooms":1,"offers":{"@type":"Offer","price":1100},
       "address":{"@type":"PostalAddress","streetAddress":"1 Main","addressLocality":"Madison","addressRegion":"WI","postalCode":"53703"},
       "image":["/photos/hero.jpg"]}
      </script>
      <meta property="og:image" content="/og/cover.jpg" />
    </head><body></body></html>`;
    const redirectingFetcher = (async () => {
      const res = new Response(html, { status: 200 });
      // `response.url` mirrors what `fetch` sets after following redirects.
      Object.defineProperty(res, 'url', { value: finalUrl });
      return res;
    }) as typeof fetch;

    const result = await extractListing(requested, { fetcher: redirectingFetcher });
    // source_url stays as the caller's input — that's the URL they care about.
    expect(result.source_url).toBe(requested);
    // Photos must resolve against the post-redirect origin, not the redirector.
    expect(result.photos).toContain('https://cdn.publisher.example.com/photos/hero.jpg');
  });
});

describe('extractFromOg', () => {
  it('treats sites with twitter cards as OG-equivalent for title/desc', () => {
    const html = `
      <meta name="twitter:title" content="Twitter Title" />
      <meta name="twitter:description" content="Twitter Desc" />
      <meta name="twitter:image" content="https://example.com/x.jpg" />
    `;
    const { fields, hasAnyOgData } = extractFromOg(html, 'https://example.com/page');
    expect(hasAnyOgData).toBe(true);
    expect(fields.title).toBe('Twitter Title');
    expect(fields.description).toBe('Twitter Desc');
    expect(fields.photos).toEqual(['https://example.com/x.jpg']);
  });

  // Codex round 5: meta content containing an invalid numeric character
  // reference must not abort the parser. Other meta tags on the page should
  // still extract cleanly.
  it('does not throw when an OG meta value contains an invalid numeric entity', async () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Bad Entity &#999999999; Listing" />
      <meta property="og:description" content="Otherwise valid description" />
      <meta property="og:image" content="https://example.com/x.jpg" />
    </head><body></body></html>`;
    const url = 'https://example.com/bad-entity';
    // Must not throw a bare RangeError from String.fromCodePoint.
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
    });
    // Title may include the unconverted entity token, but the call must succeed
    // and the other fields must come through.
    expect(result.description).toBe('Otherwise valid description');
    expect(result.photos).toEqual(['https://example.com/x.jpg']);
    expect(result.extraction_method).toBe('og');
  });
});

// ===========================================================================
// Live integration — gated
// ===========================================================================

describe.skipIf(process.env.E2E_LIVE_EXTRACTION !== '1')('live integration (E2E_LIVE_EXTRACTION=1)', () => {
  // This test is intentionally minimal — its job is to confirm that our UA
  // and timeout policy actually work against a real origin. Pinning to a
  // specific listing URL is brittle by design; flip the env var only when
  // you mean to hit the network.
  it('fetches a real listing without throwing', async () => {
    const url = process.env.E2E_LIVE_EXTRACTION_URL ?? 'https://www.apartments.com/';
    const result = await extractListing(url);
    expect(result.source_url).toBe(url);
    // Don't assert on fields — site HTML drifts.
    expect(['json_ld', 'og', 'json_ld_plus_og']).toContain(result.extraction_method);
  });
});
