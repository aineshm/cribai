import { BaseScraper, type RawListing } from './base-scraper';

export class ApartmentsComScraper extends BaseScraper {
  readonly source = 'apartments.com';

  async scrape(): Promise<readonly RawListing[]> {
    // Phase 2: Implement with Crawlee + Playwright
    // 1. Build search URL from campus lat/lng + radius
    // 2. Paginate through results
    // 3. Extract listing details
    // 4. Return normalized raw listings
    console.log(`[${this.source}] Scraping for campus ${this.config.campusSlug}...`);
    return [];
  }
}
