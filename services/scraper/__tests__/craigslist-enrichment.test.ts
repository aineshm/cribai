import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { parseDetailPage, enrichListings } from '../scrapers/craigslist-enrichment';
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

  it('extracts description from #postingbody', () => {
    const result = parseDetailPage(detailHtml);
    expect(result.description).toContain('2 bedroom');
    expect(result.description).toContain('dishwasher');
    // Should not include the print info div content
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
});

describe('enrichListings', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Clear GEMINI_API_KEY to avoid LLM calls
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
  });

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
  });

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
  });

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

    // Should return original listing unchanged
    expect(enriched!.photoUrls).toHaveLength(0);
    expect(enriched!.latitude).toBeNull();
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
  });
});
