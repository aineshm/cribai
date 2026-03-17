import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { parseDetailPage, enrichListings, detectBlock } from '../scrapers/craigslist-enrichment';
import type { RawListing } from '../scrapers/base-scraper';

const __dirname = dirname(fileURLToPath(import.meta.url));

const detailHtml = readFileSync(
  resolve(__dirname, '../fixtures/craigslist-detail.html'),
  'utf-8',
);

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Suppress console during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

function makeListing(overrides: Partial<RawListing> = {}): RawListing {
  return {
    externalId: 'cl_12345',
    source: 'craigslist',
    address: '123 Main St, Madison, WI',
    rentMonthly: 1200,
    bedrooms: null,
    bathrooms: null,
    sqft: null,
    amenities: [],
    availableDate: null,
    latitude: null,
    longitude: null,
    rawData: { title: 'Test listing', scrapedAt: '2026-03-15', category: 'apa' },
    photoUrls: [],
    sourceUrl: 'https://madison.craigslist.org/apa/d/test/12345.html',
    ...overrides,
  };
}

describe('parseDetailPage', () => {
  it('extracts photos from #thumbs', () => {
    const result = parseDetailPage(detailHtml);
    expect(result.photoUrls).toHaveLength(3);
    expect(result.photoUrls[0]).toBe('https://images.craigslist.org/00101_photo1.jpg');
  });

  it('extracts coordinates from #map', () => {
    const result = parseDetailPage(detailHtml);
    expect(result.latitude).toBeCloseTo(43.0731, 4);
    expect(result.longitude).toBeCloseTo(-89.4012, 4);
  });

  it('extracts address from .mapaddress', () => {
    const result = parseDetailPage(detailHtml);
    expect(result.address).toBe('123 University Ave, Madison, WI 53715');
  });

  it('falls back to h2.postingtitletext for address', () => {
    const html = `<html><body>
      <h2 class="postingtitletext">Cozy 1BR Downtown</h2>
    </body></html>`;
    const result = parseDetailPage(html);
    expect(result.address).toBe('Cozy 1BR Downtown');
  });

  it('extracts bathrooms from .attrgroup', () => {
    const result = parseDetailPage(detailHtml);
    expect(result.bathrooms).toBe(1);
  });

  it('extracts amenities from .attrgroup span elements', () => {
    const result = parseDetailPage(detailHtml);
    expect(result.amenities).toContain('cats_are_ok');
    expect(result.amenities).toContain('w/d_in_unit');
    expect(result.amenities).toContain('off-street_parking');
    expect(result.amenities).toContain('no_smoking');
  });

  it('skips bed/bath/sqft entries from amenities', () => {
    const result = parseDetailPage(detailHtml);
    const hasBedroomEntry = result.amenities.some(
      (a) => /^\d+br/i.test(a) || /^\d+ba/i.test(a) || /^\d+ft/i.test(a),
    );
    expect(hasBedroomEntry).toBe(false);
  });

  it('extracts description from #postingbody', () => {
    const result = parseDetailPage(detailHtml);
    expect(result.description).toContain('2 bedroom');
    expect(result.description).toContain('dishwasher');
    expect(result.description).not.toContain('QR code info');
  });

  it('extracts posted date', () => {
    const result = parseDetailPage(detailHtml);
    expect(result.postedDate).toBe('2026-03-10T14:30:00-0600');
  });

  it('handles page with no photos', () => {
    const html = '<html><body><div id="postingbody">Simple listing</div></body></html>';
    const result = parseDetailPage(html);
    expect(result.photoUrls).toHaveLength(0);
  });

  it('handles page with no map', () => {
    const html = '<html><body><div id="postingbody">Simple listing</div></body></html>';
    const result = parseDetailPage(html);
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.address).toBeNull();
  });

  it('handles page with gallery images instead of thumbs', () => {
    const html = `<html><body>
      <div class="gallery">
        <img src="https://images.craigslist.org/gallery1.jpg" />
        <img src="https://images.craigslist.org/gallery2.jpg" />
      </div>
    </body></html>`;
    const result = parseDetailPage(html);
    expect(result.photoUrls).toHaveLength(2);
  });

  it('deduplicates photos and caps at 10', () => {
    const imgs = Array.from({ length: 15 }, (_, i) =>
      `<a href="https://images.craigslist.org/photo${i % 8}.jpg"><img /></a>`,
    ).join('');
    const html = `<html><body><div id="thumbs">${imgs}</div></body></html>`;
    const result = parseDetailPage(html);
    expect(result.photoUrls.length).toBeLessThanOrEqual(10);
    expect(new Set(result.photoUrls).size).toBe(result.photoUrls.length);
  });
});

describe('detectBlock', () => {
  it('detects "blocked" in response', () => {
    expect(detectBlock('<html><body>This page is blocked</body></html>')).toBe(true);
  });

  it('detects "captcha" in response', () => {
    expect(detectBlock('<html><body>Please complete the CAPTCHA</body></html>')).toBe(true);
  });

  it('detects "verify you are human"', () => {
    expect(detectBlock('<html><body>Please verify you are human</body></html>')).toBe(true);
  });

  it('returns false for normal page', () => {
    expect(detectBlock(detailHtml)).toBe(false);
  });
});

describe('enrichListings', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.GEMINI_API_KEY;
  });

  it('returns empty array for empty input', async () => {
    const result = await enrichListings([]);
    expect(result).toEqual([]);
  });

  it('merges photo URLs from detail page', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => detailHtml,
    });

    const listing = makeListing();
    const [enriched] = await enrichListings([listing]);

    expect(enriched!.photoUrls).toHaveLength(3);
    expect(enriched!.photoUrls[0]).toContain('photo1.jpg');
  }, 15000);

  it('merges coordinates from detail page', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => detailHtml,
    });

    const listing = makeListing();
    const [enriched] = await enrichListings([listing]);

    expect(enriched!.latitude).toBeCloseTo(43.0731, 4);
    expect(enriched!.longitude).toBeCloseTo(-89.4012, 4);
  }, 15000);

  it('merges address from detail page', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => detailHtml,
    });

    const listing = makeListing({ address: 'Craigslist listing' });
    const [enriched] = await enrichListings([listing]);

    expect(enriched!.address).toBe('123 University Ave, Madison, WI 53715');
  }, 15000);

  it('merges bathrooms from detail page', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => detailHtml,
    });

    const listing = makeListing();
    const [enriched] = await enrichListings([listing]);

    expect(enriched!.bathrooms).toBe(1);
  }, 15000);

  it('merges amenities from detail page', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => detailHtml,
    });

    const listing = makeListing();
    const [enriched] = await enrichListings([listing]);

    expect(enriched!.amenities.length).toBeGreaterThan(0);
    expect(enriched!.amenities).toContain('cats_are_ok');
  }, 15000);

  it('preserves existing data when detail page has no info', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html><body></body></html>',
    });

    const listing = makeListing({
      bedrooms: 3,
      latitude: 43.0,
      longitude: -89.0,
    });
    const [enriched] = await enrichListings([listing]);

    expect(enriched!.bedrooms).toBe(3);
    expect(enriched!.latitude).toBeCloseTo(43.0);
    expect(enriched!.longitude).toBeCloseTo(-89.0);
  }, 15000);

  it('skips listings without sourceUrl', async () => {
    const listing = makeListing({ sourceUrl: '' });
    const [enriched] = await enrichListings([listing]);

    expect(enriched!.photoUrls).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles fetch failure gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    const listing = makeListing();
    const [enriched] = await enrichListings([listing]);

    expect(enriched!.photoUrls).toHaveLength(0);
    expect(enriched!.latitude).toBeNull();
  }, 30000);

  it('stops enrichment on block detection and returns partial results', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: true, status: 200, text: async () => detailHtml };
      }
      return { ok: true, status: 200, text: async () => '<html><body>Please verify you are human</body></html>' };
    });

    const listings = [
      makeListing({ externalId: 'cl_1', sourceUrl: 'https://madison.craigslist.org/apa/d/a/1.html' }),
      makeListing({ externalId: 'cl_2', sourceUrl: 'https://madison.craigslist.org/apa/d/b/2.html' }),
      makeListing({ externalId: 'cl_3', sourceUrl: 'https://madison.craigslist.org/apa/d/c/3.html' }),
    ];

    const result = await enrichListings(listings);

    expect(result).toHaveLength(3);
    expect(result[0]!.latitude).toBeCloseTo(43.0731, 4);
    expect(result[1]!.latitude).toBeNull();
    expect(result[2]!.latitude).toBeNull();
    expect(callCount).toBe(2);
  }, 30000);

  it('stops enrichment after 3 consecutive fetch failures (soft block)', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      // All fetches return 403
      return { ok: false, status: 403, text: async () => 'Forbidden' };
    });

    const listings = Array.from({ length: 5 }, (_, i) =>
      makeListing({
        externalId: `cl_${i}`,
        sourceUrl: `https://madison.craigslist.org/apa/d/listing/${i}.html`,
      }),
    );

    const result = await enrichListings(listings);

    expect(result).toHaveLength(5);
    // All listings returned unenriched
    for (const l of result) {
      expect(l.latitude).toBeNull();
    }
    // Should stop after 3 consecutive failures (with retries: 3 * 2 = 6 fetch calls)
    expect(callCount).toBeLessThanOrEqual(6);
  }, 60000);

  it('respects maxPages cap', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      return { ok: true, status: 200, text: async () => detailHtml };
    });

    const listings = Array.from({ length: 5 }, (_, i) =>
      makeListing({
        externalId: `cl_${i}`,
        sourceUrl: `https://madison.craigslist.org/apa/d/listing/${i}.html`,
      }),
    );

    const result = await enrichListings(listings, 2);

    expect(result).toHaveLength(5);
    expect(callCount).toBe(2);
    expect(result[0]!.latitude).toBeCloseTo(43.0731, 4);
    expect(result[1]!.latitude).toBeCloseTo(43.0731, 4);
    expect(result[2]!.latitude).toBeNull();
  }, 30000);

  it('stores description in rawData', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => detailHtml,
    });

    const listing = makeListing();
    const [enriched] = await enrichListings([listing]);

    expect((enriched!.rawData as Record<string, unknown>).description).toContain('2 bedroom');
  }, 15000);
});
