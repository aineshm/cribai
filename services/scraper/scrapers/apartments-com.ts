import { PlaywrightCrawler, type Log } from 'crawlee';
import type { Page } from 'playwright';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BaseScraper, type RawListing } from './base-scraper';
import { extractPhotos } from './photo-utils';

const MAX_PAGES = 10;

// Initialize stealth plugin
chromium.use(stealthPlugin());

export class ApartmentsComScraper extends BaseScraper {
  readonly source = 'apartments.com';

  async scrape(): Promise<readonly RawListing[]> {
    const listings: RawListing[] = [];

    console.log(`[${this.source}] Scraping for campus ${this.config.campusSlug}...`);

    const crawler = new PlaywrightCrawler({
      launchContext: {
        launcher: chromium,
        launchOptions: { headless: true },
      },
      maxRequestsPerMinute: 20,
      navigationTimeoutSecs: 30,
      headless: true,
      maxRequestRetries: 2,
      requestHandler: async ({ page, request, enqueueLinks, log }) => {
        if (request.label === 'DETAIL') {
          const listing = await this.extractListing(page, request.url, log);
          if (listing) {
            listings.push(listing);
          }
        } else {
          // Search results page — enqueue detail links and pagination
          await this.handleSearchPage(page, enqueueLinks, log);
        }
      },
      failedRequestHandler: async ({ request, log }) => {
        log.warning(`Request failed: ${request.url}`);
      },
    });

    const searchUrl = this.buildSearchUrl();
    console.log(`[${this.source}] Search URL: ${searchUrl}`);

    await crawler.run([{ url: searchUrl, label: 'SEARCH' }]);

    console.log(`[${this.source}] Extracted ${listings.length} listings`);
    return listings;
  }

  private buildSearchUrl(): string {
    const { latitude, longitude } = this.config;
    // Use Apartments.com bounding-box search centered on campus
    const delta = this.config.radiusKm * 0.009; // ~0.009 degrees per km
    const south = latitude - delta;
    const north = latitude + delta;
    const west = longitude - delta;
    const east = longitude + delta;
    const bb = `${west},${south},${east},${north}`;

    return `https://www.apartments.com/apartments/${this.config.campusSlug}/?bb=${encodeURIComponent(bb)}`;
  }

  private async handleSearchPage(
    page: Page,
    enqueueLinks: (options: {
      selector?: string;
      label?: string;
      globs?: string[];
    }) => Promise<unknown>,
    log: Log,
  ): Promise<void> {
    // Wait for listing cards to load
    await page.waitForSelector('article.placard', { timeout: 15_000 }).catch(() => {
      log.warning('No listing cards found on search page');
    });

    // Enqueue detail page links
    await enqueueLinks({
      selector: 'a.property-link',
      label: 'DETAIL',
      globs: ['https://www.apartments.com/*/'],
    });

    // Enqueue next pages (up to MAX_PAGES)
    const currentPage = this.parsePageNumber(page.url());
    if (currentPage < MAX_PAGES) {
      await enqueueLinks({
        selector: 'a.next',
        label: 'SEARCH',
      });
    }

    const count = await page.locator('article.placard').count();
    log.info(`Found ${count} listing cards on page ${currentPage}`);
  }

  private parsePageNumber(url: string): number {
    const match = url.match(/(\d+)\/?$/);
    return match?.[1] ? parseInt(match[1], 10) : 1;
  }

  private async extractListing(
    page: Page,
    url: string,
    log: Log,
  ): Promise<RawListing | null> {
    try {
      // Wait for content to load
      await page.waitForSelector('h1', { timeout: 10_000 });

      const address = await this.extractText(page, 'h1.propertyName, h1');
      if (!address) {
        log.warning(`No address found at ${url}`);
        return null;
      }

      const rentText = await this.extractText(
        page,
        '.rentInfoDetail .rentPrice, .pricingColumn .rent, [data-selenium="TextRent"], .rentRollup .price',
      );
      const rent = this.parseRent(rentText);
      if (rent === null) {
        log.info(`No rent found at ${url} -- saving with null rent`);
      }

      const bedBathText = await this.extractText(
        page,
        '.bedBathArea, .priceBedRangeInfo, [data-selenium="TextBedRange"]',
      );
      const { bedrooms, bathrooms } = this.parseBedBath(bedBathText);

      const sqftText = await this.extractText(
        page,
        '.sqftColumn .sqft, [data-selenium="TextSqFt"], .rentInfoDetail .sqft',
      );
      const sqft = this.parseSqft(sqftText);

      const amenities = await this.extractAmenities(page);
      const availableDate = await this.extractAvailableDate(page);
      const coordinates = await this.extractCoordinates(page);
      const externalId = this.extractExternalId(url);
      const photoUrls = await extractPhotos(page, log);

      return {
        externalId,
        source: this.source,
        address: address.trim(),
        rentMonthly: rent,
        bedrooms,
        bathrooms,
        sqft,
        amenities,
        availableDate,
        latitude: coordinates?.lat ?? null,
        longitude: coordinates?.lng ?? null,
        rawData: { url, scrapedAt: new Date().toISOString() },
        photoUrls,
        sourceUrl: url,
      };
    } catch (err) {
      log.warning(`Failed to extract listing from ${url}: ${err}`);
      return null;
    }
  }

  private async extractText(page: Page, selector: string): Promise<string> {
    const el = page.locator(selector).first();
    const text = await el.textContent({ timeout: 3_000 }).catch(() => null);
    return text?.trim() ?? '';
  }

  private parseRent(text: string): number | null {
    if (!text) return null;
    // Handle ranges like "$1,200 - $1,500" — take the lower bound
    const matches = text.match(/\$[\d,]+/g);
    if (!matches || matches.length === 0) return null;
    const value = parseInt(matches[0].replace(/[$,]/g, ''), 10);
    return isNaN(value) ? null : value;
  }

  private parseBedBath(text: string): {
    bedrooms: number | null;
    bathrooms: number | null;
  } {
    if (!text) return { bedrooms: null, bathrooms: null };
    const bedMatch = text.match(/(\d+)\s*(?:bed|br|bedroom)/i);
    const bathMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:bath|ba|bathroom)/i);
    return {
      bedrooms: bedMatch?.[1] ? parseInt(bedMatch[1], 10) : null,
      bathrooms: bathMatch?.[1] ? parseFloat(bathMatch[1]) : null,
    };
  }

  private parseSqft(text: string): number | null {
    if (!text) return null;
    const match = text.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft)/i);
    if (!match) return null;
    const value = parseInt(match[1]?.replace(/,/g, '') ?? '', 10);
    return isNaN(value) ? null : value;
  }

  private async extractAmenities(page: Page): Promise<string[]> {
    const amenityEls = page.locator(
      '.amenitiesSection li, .amenityCard .amenityLabel, [data-selenium="TextAmenity"]',
    );
    const count = await amenityEls.count();
    const amenities: string[] = [];
    for (let i = 0; i < Math.min(count, 50); i++) {
      const text = await amenityEls.nth(i).textContent().catch(() => null);
      if (text?.trim()) {
        amenities.push(text.trim());
      }
    }
    return amenities;
  }

  private async extractAvailableDate(page: Page): Promise<string | null> {
    const text = await this.extractText(
      page,
      '.availabilityInfo, [data-selenium="TextAvailDate"], .dateAvailable',
    );
    if (!text) return null;
    // Try to parse common date formats
    const match = text.match(
      /(\d{1,2}\/\d{1,2}\/\d{4})|(\w+ \d{1,2},? \d{4})/,
    );
    if (!match) return null;
    const date = new Date(match[0]);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0] ?? null;
  }

  private async extractCoordinates(
    page: Page,
  ): Promise<{ lat: number; lng: number } | null> {
    // Try JSON-LD first
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent({ timeout: 2_000 })
      .catch(() => null);

    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd);
        const geo = data.geo ?? data['@graph']?.[0]?.geo;
        if (geo?.latitude && geo?.longitude) {
          return { lat: Number(geo.latitude), lng: Number(geo.longitude) };
        }
      } catch {
        // ignore parse errors
      }
    }

    // Fallback: check meta tags
    const lat = await page
      .locator('meta[property="place:location:latitude"]')
      .first()
      .getAttribute('content', { timeout: 1_000 })
      .catch(() => null);
    const lng = await page
      .locator('meta[property="place:location:longitude"]')
      .first()
      .getAttribute('content', { timeout: 1_000 })
      .catch(() => null);

    if (lat && lng) {
      return { lat: Number(lat), lng: Number(lng) };
    }

    return null;
  }

  private extractExternalId(url: string): string {
    // Extract the slug from URLs like https://www.apartments.com/the-apartment-name/abc123/
    const parts = url.replace(/\/$/, '').split('/');
    return parts[parts.length - 1] || parts[parts.length - 2] || url;
  }
}
