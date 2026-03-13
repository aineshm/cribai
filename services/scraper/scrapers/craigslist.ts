import * as cheerio from 'cheerio';
import { BaseScraper, type RawListing } from './base-scraper';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Map campus slugs to craigslist subdomains (ut-austin disabled — UW Madison only for now)
const CAMPUS_TO_CL: Record<string, string> = {
  'uw-madison': 'madison',
};

const CATEGORIES = ['apa', 'sub'] as const;
type Category = (typeof CATEGORIES)[number];

const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (response.ok) {
        return await response.text();
      }

      console.warn(
        `[craigslist] HTTP ${response.status} for ${url} (attempt ${attempt + 1}/${retries + 1})`,
      );
    } catch (err) {
      console.warn(
        `[craigslist] Fetch error for ${url} (attempt ${attempt + 1}/${retries + 1}):`,
        err instanceof Error ? err.message : err,
      );
    }

    if (attempt < retries) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await sleep(backoff);
    }
  }

  return null;
}

function parseListings(html: string, category: Category): readonly RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('li.cl-static-search-result').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a').attr('href') ?? '';
    const title = $el.find('.title').text().trim();
    const priceText = $el.find('.price').text().trim();
    const location = $el.find('.location').text().trim();

    const postingId = link.match(/\/(\d+)\.html/)?.[1] ?? '';
    if (!postingId) return;

    const rent = priceText ? parseInt(priceText.replace(/[$,]/g, ''), 10) : null;
    const validRent = rent !== null && !isNaN(rent) ? rent : null;

    // Parse bedrooms from title: "2br" or "2 bed" or "2 bedroom"
    const bedMatch = title.match(/(\d+)\s*(?:br|bed)/i);
    const bedrooms = bedMatch?.[1] ? parseInt(bedMatch[1], 10) : null;

    // Parse sqft from title: "800ft2" or "800 ft2"
    const sqftMatch = title.match(/([\d,]+)\s*ft2?/i);
    const sqft = sqftMatch?.[1] ? parseInt(sqftMatch[1].replace(/,/g, ''), 10) : null;

    listings.push({
      externalId: `cl_${postingId}`,
      source: 'craigslist',
      address: location || 'Craigslist listing',
      rentMonthly: validRent,
      bedrooms,
      bathrooms: null,
      sqft,
      amenities: [],
      availableDate: null,
      latitude: null,
      longitude: null,
      rawData: { title, scrapedAt: new Date().toISOString(), category },
      photoUrls: [],
      sourceUrl: link,
    });
  });

  return listings;
}

export class CraigslistScraper extends BaseScraper {
  readonly source = 'craigslist';

  async scrape(): Promise<readonly RawListing[]> {
    const subdomain = CAMPUS_TO_CL[this.config.campusSlug] ?? this.config.campusSlug;
    const allListings: RawListing[] = [];

    for (let i = 0; i < CATEGORIES.length; i++) {
      const category = CATEGORIES[i]!;
      const url = `https://${subdomain}.craigslist.org/search/${category}`;

      console.log(`[${this.source}] Fetching HTML: ${url}`);

      const html = await fetchWithRetry(url);

      if (!html) {
        console.warn(`[${this.source}] Failed to fetch ${url} after retries`);
        continue;
      }

      const listings = parseListings(html, category);
      console.log(`[${this.source}] Parsed ${listings.length} listings from /${category}`);
      allListings.push(...listings);

      // Add delay between requests (skip after last)
      if (i < CATEGORIES.length - 1) {
        const delay = 2000 + Math.random() * 1000;
        await sleep(delay);
      }
    }

    if (allListings.length === 0) {
      console.warn(`[${this.source}] No listings found from any category`);
    } else {
      console.log(`[${this.source}] Total: ${allListings.length} listings from ${CATEGORIES.length} categories`);
    }

    return allListings;
  }
}
