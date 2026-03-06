import { BaseScraper, type RawListing } from './base-scraper';

const NEXT_DATA_REGEX = /<script\s+id="__NEXT_DATA__"[^>]*>(.+?)<\/script>/s;
const JSON_LD_REGEX = /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function parsePrice(priceStr: string | number | null | undefined): number | null {
  if (priceStr == null) return null;
  const str = String(priceStr);
  const match = str.match(/\$?([\d,]+)/);
  if (!match?.[1]) return null;
  const parsed = parseInt(match[1].replace(/,/g, ''), 10);
  return isNaN(parsed) ? null : parsed;
}

function extractListResults(data: Record<string, unknown>): readonly Record<string, unknown>[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageProps = (data as any).props?.pageProps;
    if (!pageProps) return [];

    const searchState = pageProps.searchPageState;
    if (!searchState) return [];

    const cat1 = searchState.cat1;
    if (!cat1) return [];

    const listResults = cat1.searchResults?.listResults;
    if (!Array.isArray(listResults)) return [];

    return listResults as readonly Record<string, unknown>[];
  } catch {
    return [];
  }
}

function mapResultToListing(result: Record<string, unknown>): RawListing | null {
  const zpid = String(result.zpid ?? '');
  if (!zpid) return null;

  const addressStreet = result.addressStreet ?? result.address ?? '';
  const addressCity = result.addressCity ?? '';
  const addressState = result.addressState ?? '';
  const addressZipcode = result.addressZipcode ?? '';
  const fullAddress = [addressStreet, addressCity, addressState, addressZipcode]
    .filter(Boolean)
    .join(', ');

  // Price can be top-level or in units array
  let rent: number | null = null;
  let beds: number | null = null;

  const units = result.units as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(units) && units.length > 0) {
    const firstUnit = units[0];
    rent = parsePrice(firstUnit?.price as string | number | null);
    beds = typeof firstUnit?.beds === 'number' ? firstUnit.beds : null;
  }

  if (rent === null) {
    rent = parsePrice(result.price as string | number | null);
  }
  if (beds === null && typeof result.beds === 'number') {
    beds = result.beds;
  }

  const latLong = result.latLong as { latitude?: number; longitude?: number } | undefined;

  const imgSrc = result.imgSrc as string | undefined;
  const photoUrls = imgSrc ? [imgSrc] : [];

  const detailUrl = result.detailUrl as string | undefined;
  const sourceUrl = detailUrl
    ? (detailUrl.startsWith('http') ? detailUrl : `https://www.zillow.com${detailUrl}`)
    : `https://www.zillow.com/homedetails/${zpid}_zpid/`;

  return {
    externalId: zpid,
    source: 'zillow',
    address: fullAddress || 'Zillow listing',
    rentMonthly: rent,
    bedrooms: beds,
    bathrooms: null,
    sqft: null,
    amenities: [],
    availableDate: null,
    latitude: latLong?.latitude ?? null,
    longitude: latLong?.longitude ?? null,
    rawData: {
      scrapedAt: new Date().toISOString(),
      buildingName: result.buildingName ?? null,
    },
    photoUrls,
    sourceUrl,
  };
}

export class ZillowScraper extends BaseScraper {
  readonly source = 'zillow';

  async scrape(): Promise<readonly RawListing[]> {
    const url = 'https://www.zillow.com/madison-wi/rentals/';
    console.log(`[${this.source}] Fetching: ${url}`);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } catch (err) {
      console.warn(`[${this.source}] Fetch failed:`, err);
      return [];
    }

    if (!response.ok) {
      console.warn(
        `[${this.source}] HTTP ${response.status} — Zillow may be blocking or rate-limiting`,
      );
      return [];
    }

    const html = await response.text();

    // Try __NEXT_DATA__ first
    const nextDataMatch = html.match(NEXT_DATA_REGEX);
    if (nextDataMatch?.[1]) {
      try {
        const data = JSON.parse(nextDataMatch[1]) as Record<string, unknown>;
        const listResults = extractListResults(data);

        if (listResults.length > 0) {
          const listings = listResults
            .map(mapResultToListing)
            .filter((l): l is RawListing => l !== null);
          console.log(`[${this.source}] Parsed ${listings.length} listings from __NEXT_DATA__`);
          return listings;
        }
      } catch (err) {
        console.warn(`[${this.source}] Failed to parse __NEXT_DATA__:`, err);
      }
    }

    // Fallback: try JSON-LD
    let jsonLdMatch: RegExpExecArray | null;
    while ((jsonLdMatch = JSON_LD_REGEX.exec(html)) !== null) {
      try {
        const ld = JSON.parse(jsonLdMatch[1] ?? '');
        if (ld['@type'] === 'ItemList' && Array.isArray(ld.itemListElement)) {
          console.log(
            `[${this.source}] Found JSON-LD ItemList with ${ld.itemListElement.length} items`,
          );
        }
      } catch {
        // Continue trying other JSON-LD blocks
      }
    }

    console.warn(`[${this.source}] No listing data found in HTML response`);
    return [];
  }
}
