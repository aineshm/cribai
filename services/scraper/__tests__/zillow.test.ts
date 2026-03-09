import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import type { RawListing } from '../scrapers/base-scraper';
import { normalizeListing } from '../normalizer';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load real fixtures
const searchFixture = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/apify-zillow-search.json'), 'utf-8'),
);
const detailFixture = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/apify-zillow-detail.json'), 'utf-8'),
);

// Mock the apify client module
const mockRunSearchScraper = vi.fn();
const mockRunDetailScraper = vi.fn();

vi.mock('../clients/apify', () => ({
  runSearchScraper: (...args: unknown[]) => mockRunSearchScraper(...args),
  runDetailScraper: (...args: unknown[]) => mockRunDetailScraper(...args),
}));

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

describe('ZillowScraper (Apify two-pass)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APIFY_API_TOKEN = 'test-token';
    mockRunSearchScraper.mockResolvedValue(searchFixture);
    mockRunDetailScraper.mockResolvedValue(detailFixture);
  });

  afterEach(() => {
    delete process.env.APIFY_API_TOKEN;
  });

  it('extracts detail URLs from search results', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    await scraper.scrape();

    // runSearchScraper should be called
    expect(mockRunSearchScraper).toHaveBeenCalledWith(
      'test-token',
      expect.stringContaining('zillow.com/madison-wi/apartments/'),
      undefined,
    );

    // Detail scraper should receive URLs extracted from search fixture
    const detailCall = mockRunDetailScraper.mock.calls[0];
    const urls = detailCall?.[1] as string[];
    expect(urls).toHaveLength(5);
    // All URLs should be absolute
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it('flattens floorPlans into individual RawListings', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    const results = await scraper.scrape();

    // McKenzie Place has 2 floorPlans with 1 unit each = 2 RawListings
    // But fixture has 2 DUPLICATE building objects (same zpid 452652518)
    // After dedup, still 1 building with 2 floorPlans = 2 units
    expect(results.length).toBe(2);
  });

  it('maps fields correctly', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    const results = await scraper.scrape();
    const first = results[0] as RawListing;

    expect(first.bedrooms).toBe(1);
    expect(first.bathrooms).toBe(1);
    expect(first.rentMonthly).toBe(1750);
    expect(first.sqft).toBe(772);
    expect(first.address).toContain('2221 Sherman Ave');
    expect(first.source).toBe('zillow');
    expect(first.externalId).toContain('452652518');
    expect(first.latitude).toBe(43.102451);
    expect(first.longitude).toBe(-89.364288);
    expect(first.sourceUrl).toContain('zillow.com');
  });

  it('extracts up to 10 image URLs from galleryPhotos', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    const results = await scraper.scrape();
    const first = results[0] as RawListing;

    expect(first.photoUrls.length).toBeGreaterThan(0);
    expect(first.photoUrls.length).toBeLessThanOrEqual(10);
    // Each should be a JPEG URL (800px variant)
    for (const url of first.photoUrls) {
      expect(url).toMatch(/\.jpg$/);
    }
  });

  it('includes amenities from buildingAttributes', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    const results = await scraper.scrape();
    const first = results[0] as RawListing;

    expect(first.amenities).toContain('Dishwasher');
    expect(first.amenities).toContain('Washer');
    expect(first.amenities).toContain('GarbageDisposal');
    expect(first.amenities).toContain('Dryer');
  });

  it('handles deduplication of same zpid', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    // Detail fixture has 2 identical objects with zpid 452652518
    const results = await scraper.scrape();

    // Should produce same count as if there was only 1 building
    // McKenzie Place: 2 floorPlans x 1 unit each = 2
    expect(results.length).toBe(2);
  });

  it('output passes normalizer without errors', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    const results = await scraper.scrape();

    for (const listing of results) {
      expect(() => normalizeListing(listing)).not.toThrow();
    }
  });

  it('handles building with no floorPlans', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    // Mock detail result with empty floorPlans
    mockRunDetailScraper.mockResolvedValueOnce([
      {
        zpid: '999999',
        buildingName: 'Empty Building',
        streetAddress: '100 Test St',
        latitude: 43.0,
        longitude: -89.0,
        address: { city: 'Madison', state: 'WI', zipcode: '53703' },
        floorPlans: [],
        galleryPhotos: [],
        description: '',
        bdpUrl: '/test/',
      },
    ]);

    const results = await scraper.scrape();
    expect(results.length).toBe(0);
  });

  it('throws when APIFY_API_TOKEN missing', async () => {
    delete process.env.APIFY_API_TOKEN;

    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    await expect(scraper.scrape()).rejects.toThrow('APIFY_API_TOKEN');
  });

  it('maps second floor plan correctly (2BR)', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);

    const results = await scraper.scrape();
    const second = results[1] as RawListing;

    expect(second.bedrooms).toBe(2);
    expect(second.bathrooms).toBe(2);
    expect(second.rentMonthly).toBe(2410);
    expect(second.sqft).toBe(1063);
  });

  it('has source set to zillow', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper(MOCK_CONFIG);
    expect(scraper.source).toBe('zillow');
  });

  it('skips campuses without a configured Zillow URL', async () => {
    const { ZillowScraper } = await import('../scrapers/zillow');
    const scraper = new ZillowScraper({ ...MOCK_CONFIG, campusSlug: 'ut-austin' });

    const results = await scraper.scrape();
    expect(results.length).toBe(0);
    expect(mockRunSearchScraper).not.toHaveBeenCalled();
  });
});
