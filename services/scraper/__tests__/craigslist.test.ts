import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { normalizeListing } from '../normalizer';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load real HTML fixtures
const apaHtml = readFileSync(
  resolve(__dirname, '../fixtures/craigslist-madison-apa.html'),
  'utf-8',
);
const subHtml = readFileSync(
  resolve(__dirname, '../fixtures/craigslist-madison-sub.html'),
  'utf-8',
);

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Suppress console during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

const MOCK_CONFIG = {
  campusId: 'campus-1',
  campusSlug: 'uw-madison',
  latitude: 43.0731,
  longitude: -89.4012,
  radiusKm: 5,
} as const;

function makeOkResponse(html: string) {
  return {
    ok: true,
    status: 200,
    text: async () => html,
  };
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    text: async () => 'Error',
  };
}

describe('CraigslistScraper (cheerio HTML)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses apartments from real HTML', async () => {
    // Return apa fixture for /apa, empty for /sub
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/apa')) return makeOkResponse(apaHtml);
      return makeOkResponse('<html><body><ol class="cl-static-search-results"></ol></body></html>');
    });

    const { CraigslistScraper } = await import('../scrapers/craigslist');
    const scraper = new CraigslistScraper(MOCK_CONFIG);

    const results = await scraper.scrape();
    // Should parse the listings from apa fixture (352 based on grep count)
    expect(results.length).toBeGreaterThan(100);
    // All should be RawListing shape
    for (const r of results.slice(0, 5)) {
      expect(r.source).toBe('craigslist');
      expect(r.externalId).toMatch(/^cl_\d+$/);
    }
  });

  it('extracts price from .price div', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/apa')) return makeOkResponse(apaHtml);
      return makeOkResponse('<html><body><ol class="cl-static-search-results"></ol></body></html>');
    });

    const { CraigslistScraper } = await import('../scrapers/craigslist');
    const scraper = new CraigslistScraper(MOCK_CONFIG);

    const results = await scraper.scrape();
    const first = results[0]!;
    expect(first.rentMonthly).toBe(1499);
  });

  it('extracts address from .location div', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/apa')) return makeOkResponse(apaHtml);
      return makeOkResponse('<html><body><ol class="cl-static-search-results"></ol></body></html>');
    });

    const { CraigslistScraper } = await import('../scrapers/craigslist');
    const scraper = new CraigslistScraper(MOCK_CONFIG);

    const results = await scraper.scrape();
    const first = results[0]!;
    expect(first.address).toContain('4717 Eastpark Blvd');
    expect(first.address).toContain('Madison');
  });

  it('extracts posting ID from URL', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/apa')) return makeOkResponse(apaHtml);
      return makeOkResponse('<html><body><ol class="cl-static-search-results"></ol></body></html>');
    });

    const { CraigslistScraper } = await import('../scrapers/craigslist');
    const scraper = new CraigslistScraper(MOCK_CONFIG);

    const results = await scraper.scrape();
    const first = results[0]!;
    expect(first.externalId).toBe('cl_7917794434');
    expect(first.sourceUrl).toContain('7917794434.html');
  });

  it('scrapes both /apa and /sub categories', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/apa')) return makeOkResponse(apaHtml);
      if (typeof url === 'string' && url.includes('/sub')) return makeOkResponse(subHtml);
      return makeOkResponse('<html><body></body></html>');
    });

    const { CraigslistScraper } = await import('../scrapers/craigslist');
    const scraper = new CraigslistScraper(MOCK_CONFIG);

    const results = await scraper.scrape();

    // Should have results from both categories
    const apaResults = results.filter((r) => (r.rawData as Record<string, unknown>).category === 'apa');
    const subResults = results.filter((r) => (r.rawData as Record<string, unknown>).category === 'sub');

    expect(apaResults.length).toBeGreaterThan(0);
    expect(subResults.length).toBeGreaterThan(0);
    expect(results.length).toBe(apaResults.length + subResults.length);
  });

  it('handles fetch failure with retry', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      // Fail first two calls, succeed on third
      if (callCount <= 2) return makeErrorResponse(500);
      return makeOkResponse(apaHtml);
    });

    const { CraigslistScraper } = await import('../scrapers/craigslist');
    const scraper = new CraigslistScraper(MOCK_CONFIG);

    const results = await scraper.scrape();
    // First category (/apa) should eventually succeed after retries
    // Second category (/sub) may also have retries
    expect(callCount).toBeGreaterThanOrEqual(3);
  }, 30000);

  it('output passes normalizer', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/apa')) return makeOkResponse(apaHtml);
      return makeOkResponse('<html><body><ol class="cl-static-search-results"></ol></body></html>');
    });

    const { CraigslistScraper } = await import('../scrapers/craigslist');
    const scraper = new CraigslistScraper(MOCK_CONFIG);

    const results = await scraper.scrape();

    for (const listing of results) {
      expect(() => normalizeListing(listing)).not.toThrow();
    }
  });

  it('handles empty results page', async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse('<html><body><ol class="cl-static-search-results"></ol></body></html>'),
    );

    const { CraigslistScraper } = await import('../scrapers/craigslist');
    const scraper = new CraigslistScraper(MOCK_CONFIG);

    const results = await scraper.scrape();
    expect(results).toEqual([]);
  });

  it('has source set to craigslist', async () => {
    const { CraigslistScraper } = await import('../scrapers/craigslist');
    const scraper = new CraigslistScraper(MOCK_CONFIG);
    expect(scraper.source).toBe('craigslist');
  });
});
