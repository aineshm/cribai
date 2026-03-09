import { BaseScraper, type RawListing, type ScraperConfig } from './base-scraper';
import {
  runSearchScraper,
  runDetailScraper,
  type ZillowDetailResult,
} from '../clients/apify';

// Campus-specific Zillow search URLs with searchQueryState (required by Apify actor).
// Each URL defines map bounds around the campus area and filters for rentals only.
const CAMPUS_ZILLOW_URLS: Record<string, string> = {
  'uw-madison':
    'https://www.zillow.com/madison-wi/apartments/?searchQueryState=%7B%22isMapVisible%22%3Atrue%2C%22mapBounds%22%3A%7B%22north%22%3A43.113614418178116%2C%22south%22%3A43.02683653577741%2C%22east%22%3A-89.33942318737792%2C%22west%22%3A-89.4702291566162%7D%2C%22filterState%22%3A%7B%22sort%22%3A%7B%22value%22%3A%22priorityscore%22%7D%2C%22fr%22%3A%7B%22value%22%3Atrue%7D%2C%22fsba%22%3A%7B%22value%22%3Afalse%7D%2C%22fsbo%22%3A%7B%22value%22%3Afalse%7D%2C%22nc%22%3A%7B%22value%22%3Afalse%7D%2C%22cmsn%22%3A%7B%22value%22%3Afalse%7D%2C%22auc%22%3A%7B%22value%22%3Afalse%7D%2C%22fore%22%3A%7B%22value%22%3Afalse%7D%2C%22mf%22%3A%7B%22value%22%3Afalse%7D%2C%22land%22%3A%7B%22value%22%3Afalse%7D%2C%22manu%22%3A%7B%22value%22%3Afalse%7D%2C%22tow%22%3A%7B%22value%22%3Afalse%7D%2C%22sf%22%3A%7B%22value%22%3Afalse%7D%7D%2C%22isListVisible%22%3Atrue%2C%22mapZoom%22%3A13%2C%22usersSearchTerm%22%3A%22Madison%20WI%20apartments%22%2C%22regionSelection%22%3A%5B%7B%22regionId%22%3A398849%2C%22regionType%22%3A6%7D%5D%2C%22pagination%22%3A%7B%7D%2C%22category%22%3A%22cat1%22%7D',
};

export class ZillowScraper extends BaseScraper {
  readonly source = 'zillow';
  private readonly maxItems?: number;

  constructor(config: ScraperConfig, maxItems?: number) {
    super(config);
    this.maxItems = maxItems;
  }

  async scrape(): Promise<readonly RawListing[]> {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      throw new Error(
        'Missing APIFY_API_TOKEN environment variable. Set it before running the Zillow scraper.',
      );
    }

    // Look up campus-specific search URL (Apify actor requires searchQueryState param)
    const searchUrl = CAMPUS_ZILLOW_URLS[this.config.campusSlug];
    if (!searchUrl) {
      console.log(`[${this.source}] No Zillow search URL configured for campus "${this.config.campusSlug}" — skipping`);
      return [];
    }

    console.log(`[${this.source}] Running Apify search scraper for ${this.config.campusSlug}`);

    const searchResults = await runSearchScraper(token, searchUrl, this.maxItems);
    console.log(`[${this.source}] Search found ${searchResults.length} listings`);

    if (searchResults.length === 0) {
      return [];
    }

    // Extract detail URLs from search results
    const detailUrls = searchResults
      .map((r) => {
        const url = r.detailUrl;
        if (!url) return null;
        return url.startsWith('http') ? url : `https://www.zillow.com${url}`;
      })
      .filter((url): url is string => url !== null);

    console.log(`[${this.source}] Enriching ${detailUrls.length} detail URLs`);

    // Step 2: Detail pass
    const detailResults = await runDetailScraper(token, detailUrls);

    // Deduplicate by zpid
    const seen = new Set<string>();
    const uniqueBuildings: ZillowDetailResult[] = [];
    for (const result of detailResults) {
      const zpid = String(result.zpid ?? '');
      if (!zpid || seen.has(zpid)) continue;
      seen.add(zpid);
      uniqueBuildings.push(result);
    }

    // Flatten floorPlans into individual RawListings
    const listings: RawListing[] = [];

    for (const building of uniqueBuildings) {
      const buildingZpid = String(building.zpid);
      const fullAddress = [
        building.streetAddress,
        building.address?.city,
        `${building.address?.state ?? ''} ${building.address?.zipcode ?? ''}`.trim(),
      ]
        .filter(Boolean)
        .join(', ');

      const photoUrls = extractPhotoUrls(building);
      const amenities = extractAmenities(building);
      const sourceUrl = `https://www.zillow.com${building.bdpUrl}`;

      const rawData: Record<string, unknown> = {
        buildingName: building.buildingName,
        walkScore: building.walkScore ?? null,
        transitScore: building.transitScore ?? null,
        bikeScore: building.bikeScore ?? null,
        specialOffers: building.specialOffers ?? null,
        buildingPhoneNumber: building.buildingPhoneNumber ?? null,
        isStudentHousing: building.isStudentHousing ?? null,
        scrapedAt: new Date().toISOString(),
      };

      const floorPlans = building.floorPlans ?? [];

      if (floorPlans.length === 0) {
        // No floor plans -- skip (nothing to list)
        continue;
      }

      for (const plan of floorPlans) {
        const units = plan.units ?? [];
        if (units.length === 0) {
          // FloorPlan with no units -- create one listing from plan data
          listings.push(
            createListing({
              buildingZpid,
              unitId: `plan_${plan.zpid ?? 'unknown'}`,
              fullAddress,
              rent: plan.minPrice ?? null,
              beds: plan.beds ?? null,
              baths: plan.baths ?? null,
              sqft: plan.sqft ?? null,
              availableDate: null,
              photoUrls,
              amenities,
              sourceUrl,
              rawData: { ...rawData, leaseTerm: plan.leaseTerm ?? null },
              latitude: building.latitude,
              longitude: building.longitude,
            }),
          );
          continue;
        }

        for (const unit of units) {
          const unitId = unit.unitNumber ?? `unit_${units.indexOf(unit)}`;
          const rawAvail = unit.availableFrom;
          const availableFrom = parseAvailableDate(rawAvail);

          listings.push(
            createListing({
              buildingZpid,
              unitId,
              fullAddress,
              rent: unit.price ?? plan.minPrice ?? null,
              beds: plan.beds ?? null,
              baths: plan.baths ?? null,
              sqft: unit.sqft ?? plan.sqft ?? null,
              availableDate: availableFrom,
              photoUrls,
              amenities,
              sourceUrl,
              rawData: { ...rawData, leaseTerm: plan.leaseTerm ?? null },
              latitude: building.latitude,
              longitude: building.longitude,
            }),
          );
        }
      }
    }

    console.log(
      `[${this.source}] Produced ${listings.length} unit listings from ${uniqueBuildings.length} buildings`,
    );

    return listings;
  }
}

function createListing(params: {
  readonly buildingZpid: string;
  readonly unitId: string;
  readonly fullAddress: string;
  readonly rent: number | null;
  readonly beds: number | null;
  readonly baths: number | null;
  readonly sqft: number | null;
  readonly availableDate: string | null;
  readonly photoUrls: readonly string[];
  readonly amenities: readonly string[];
  readonly sourceUrl: string;
  readonly rawData: Record<string, unknown>;
  readonly latitude: number;
  readonly longitude: number;
}): RawListing {
  return {
    externalId: `${params.buildingZpid}_${params.unitId}`,
    source: 'zillow',
    address: params.fullAddress,
    rentMonthly: params.rent,
    bedrooms: params.beds,
    bathrooms: params.baths,
    sqft: params.sqft,
    amenities: params.amenities,
    availableDate: params.availableDate,
    latitude: params.latitude,
    longitude: params.longitude,
    rawData: params.rawData,
    photoUrls: params.photoUrls,
    sourceUrl: params.sourceUrl,
  };
}

function extractPhotoUrls(building: ZillowDetailResult): readonly string[] {
  const photos = building.galleryPhotos ?? [];
  return photos
    .slice(0, 10)
    .map((photo) => {
      // Use the 800px JPEG variant
      const jpegVariants = photo.mixedSources?.jpeg;
      if (jpegVariants && jpegVariants.length > 0) {
        return jpegVariants[0]?.url ?? null;
      }
      return photo.url ?? null;
    })
    .filter((url): url is string => url !== null);
}

/** Convert Zillow availableFrom to ISO date string. Handles: "0" (now), Unix ms timestamps, ISO strings. */
function parseAvailableDate(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === '0' || raw === 0 || raw === '') return null;
  const num = typeof raw === 'string' ? Number(raw) : raw;
  // Unix millisecond timestamps are > 1e12 (year ~2001+)
  if (!isNaN(num) && num > 1e12) {
    return new Date(num).toISOString().split('T')[0] ?? null;
  }
  // If it's already a date-like string, pass through
  if (typeof raw === 'string' && raw.match(/^\d{4}-\d{2}/)) {
    return raw.split('T')[0] ?? null;
  }
  return null;
}

function extractAmenities(building: ZillowDetailResult): readonly string[] {
  const amenities: string[] = [];

  const appliances = building.buildingAttributes?.appliances;
  if (appliances) {
    amenities.push(...appliances);
  }

  const petPolicies = building.buildingAttributes?.petPolicies;
  if (petPolicies) {
    amenities.push(...petPolicies);
  }

  return amenities;
}
