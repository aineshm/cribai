import { BaseScraper, type RawListing, type ScraperConfig } from './base-scraper';
import {
  runSearchScraper,
  runDetailScraper,
  type ZillowDetailResult,
} from '../clients/apify';

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

    // Step 1: Search pass
    const searchUrl = 'https://www.zillow.com/madison-wi/rentals/';
    console.log(`[${this.source}] Running Apify search scraper for ${searchUrl}`);

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
          const availableFrom = unit.availableFrom === '0' ? null : (unit.availableFrom ?? null);

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
