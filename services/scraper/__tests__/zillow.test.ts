import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RawListing } from '../scrapers/base-scraper';

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

// Realistic __NEXT_DATA__ structure from Zillow rental search
const MOCK_NEXT_DATA = {
  props: {
    pageProps: {
      searchPageState: {
        cat1: {
          searchResults: {
            listResults: [
              {
                zpid: '12345678',
                addressStreet: '123 State St',
                addressCity: 'Madison',
                addressState: 'WI',
                addressZipcode: '53703',
                units: [
                  {
                    price: '$1,200+/mo',
                    beds: 2,
                  },
                ],
                latLong: { latitude: 43.074, longitude: -89.395 },
                imgSrc: 'https://photos.zillowstatic.com/photo1.jpg',
                detailUrl: '/b/123-state-st-madison-wi/12345678_zpid/',
                buildingName: 'State Street Apartments',
              },
              {
                zpid: '87654321',
                addressStreet: '456 University Ave',
                addressCity: 'Madison',
                addressState: 'WI',
                addressZipcode: '53715',
                price: '$950/mo',
                beds: 1,
                latLong: { latitude: 43.071, longitude: -89.410 },
                imgSrc: 'https://photos.zillowstatic.com/photo2.jpg',
                detailUrl: '/b/456-university-ave-madison-wi/87654321_zpid/',
              },
            ],
          },
        },
      },
    },
  },
};

function makeHtmlWithNextData(data: unknown): string {
  return `<!DOCTYPE html><html><head></head><body>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>
  </body></html>`;
}

describe('ZillowScraper', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses __NEXT_DATA__ HTML into RawListing array', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => makeHtmlWithNextData(MOCK_NEXT_DATA),
    });

    const results = await scraper.scrape();

    expect(results.length).toBe(2);

    const first = results[0] as RawListing;
    expect(first.externalId).toBe('12345678');
    expect(first.source).toBe('zillow');
    expect(first.address).toContain('123 State St');
    expect(first.rentMonthly).toBe(1200);
    expect(first.bedrooms).toBe(2);
    expect(first.sourceUrl).toContain('12345678');
    expect(first.photoUrls.length).toBeGreaterThan(0);
    expect(first.latitude).toBe(43.074);
    expect(first.longitude).toBe(-89.395);

    const second = results[1] as RawListing;
    expect(second.externalId).toBe('87654321');
    expect(second.rentMonthly).toBe(950);
    expect(second.bedrooms).toBe(1);
  });

  it('returns empty array when __NEXT_DATA__ is missing', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html><body>No data here</body></html>',
    });

    const results = await scraper.scrape();
    expect(results).toEqual([]);
  });

  it('returns empty array on 403 response', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    const results = await scraper.scrape();
    expect(results).toEqual([]);
  });

  it('has source set to zillow', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);
    expect(scraper.source).toBe('zillow');
  });
});
