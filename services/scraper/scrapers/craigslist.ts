import { BaseScraper, type RawListing } from './base-scraper';

const KM_TO_MILES = 0.621371;

// Map campus slugs to craigslist subdomains
const CAMPUS_TO_CL: Record<string, string> = {
  'uw-madison': 'madison',
  'ut-austin': 'austin',
};

interface CraigslistItem {
  readonly title: string;
  readonly link: string;
  readonly description: string;
  readonly date: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly imageUrl: string | null;
}

function parseRssItems(xml: string): readonly CraigslistItem[] {
  const items: CraigslistItem[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] ?? '';

    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const description = extractTag(block, 'description');
    const date = extractTag(block, 'dc:date');
    const lat = extractTag(block, 'geo:lat');
    const lng = extractTag(block, 'geo:long');

    // Enclosure for image
    const encMatch = block.match(/enc:enclosure[^>]*resource="([^"]+)"/);
    const imageUrl = encMatch?.[1] ?? null;

    if (title && link) {
      items.push({
        title,
        link,
        description: description ?? '',
        date: date ?? '',
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        imageUrl,
      });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string | null {
  // Handle CDATA and regular content
  const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match?.[1]?.trim() ?? null;
}

function parseCraigslistTitle(title: string): {
  rent: number | null;
  bedrooms: number | null;
  sqft: number | null;
  address: string;
} {
  // Craigslist titles follow pattern: "$1200 / 2br - 800ft2 - Nice apartment near campus"
  const rentMatch = title.match(/\$(\d[\d,]*)/);
  const rent = rentMatch?.[1] ? parseInt(rentMatch[1].replace(/,/g, ''), 10) : null;

  const bedMatch = title.match(/(\d+)\s*br\b/i);
  const bedrooms = bedMatch?.[1] ? parseInt(bedMatch[1], 10) : null;

  const sqftMatch = title.match(/([\d,]+)\s*ft2?\b/i);
  const sqft = sqftMatch?.[1] ? parseInt(sqftMatch[1].replace(/,/g, ''), 10) : null;

  // Address is everything after the last " - " separator
  const parts = title.split(/\s+-\s+/);
  const address = parts.length > 1
    ? (parts[parts.length - 1] ?? title).trim()
    : title.replace(/\$[\d,]+\s*\/?\s*/, '').trim();

  return { rent, bedrooms, sqft, address };
}

export class CraigslistScraper extends BaseScraper {
  readonly source = 'craigslist';

  async scrape(): Promise<readonly RawListing[]> {
    const subdomain = CAMPUS_TO_CL[this.config.campusSlug] ?? this.config.campusSlug;
    const radiusMiles = Math.round(this.config.radiusKm * KM_TO_MILES);

    const url = `https://${subdomain}.craigslist.org/search/apa?format=rss`
      + `&lat=${this.config.latitude}`
      + `&lon=${this.config.longitude}`
      + `&search_distance=${radiusMiles}`
      + `&availabilityMode=0`;

    console.log(`[${this.source}] Fetching RSS: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CampusNest/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      // Craigslist blocks datacenter IPs (GitHub Actions) — this is expected, not an error
      console.warn(`[${this.source}] RSS fetch returned ${response.status} — Craigslist may block datacenter IPs`);
      return [];
    }

    const xml = await response.text();
    const items = parseRssItems(xml);
    console.log(`[${this.source}] Parsed ${items.length} items from RSS`);

    return items.map((item): RawListing => {
      const parsed = parseCraigslistTitle(item.title);
      const externalId = extractCraigslistId(item.link);

      return {
        externalId,
        source: this.source,
        address: parsed.address || 'Craigslist listing',
        rentMonthly: parsed.rent,
        bedrooms: parsed.bedrooms,
        bathrooms: null, // Craigslist RSS doesn't include bathrooms
        sqft: parsed.sqft,
        amenities: [],
        availableDate: item.date ? item.date.split('T')[0] ?? null : null,
        latitude: item.lat,
        longitude: item.lng,
        rawData: { url: item.link, scrapedAt: new Date().toISOString(), description: item.description },
        photoUrls: item.imageUrl ? [item.imageUrl] : [],
        sourceUrl: item.link,
      };
    });
  }
}

function extractCraigslistId(url: string): string {
  // URLs like https://madison.craigslist.org/apa/d/madison-nice-apartment/7839123456.html
  const match = url.match(/\/(\d+)\.html/);
  return match?.[1] ?? url;
}
