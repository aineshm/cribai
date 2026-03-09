import { ApifyClient } from 'apify-client';

export interface FloorPlanUnit {
  readonly unitNumber?: string;
  readonly zpid?: string;
  readonly price?: number | null;
  readonly minPrice?: number | null;
  readonly maxPrice?: number | null;
  readonly sqft?: number | null;
  readonly availableFrom?: string | null;
}

export interface FloorPlan {
  readonly zpid?: string;
  readonly beds?: number | null;
  readonly baths?: number | null;
  readonly minPrice?: number | null;
  readonly maxPrice?: number | null;
  readonly sqft?: number | null;
  readonly name?: string;
  readonly leaseTerm?: string | null;
  readonly units?: readonly FloorPlanUnit[];
}

export interface GalleryPhoto {
  readonly caption?: string;
  readonly mixedSources?: {
    readonly jpeg?: readonly { readonly url: string; readonly width: number }[];
    readonly webp?: readonly { readonly url: string; readonly width: number }[];
  };
  readonly url?: string;
}

export interface ZillowSearchResult {
  readonly address: string;
  readonly price: string;
  readonly imgSrc: string;
  readonly detailUrl: string;
  readonly statusType: string;
  readonly buildingName?: string;
  readonly latLong?: { readonly latitude: number; readonly longitude: number };
}

export interface ZillowDetailResult {
  readonly zpid: string;
  readonly buildingName: string;
  readonly streetAddress: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly address: { readonly city: string; readonly state: string; readonly zipcode: string };
  readonly floorPlans: readonly FloorPlan[];
  readonly galleryPhotos: readonly GalleryPhoto[];
  readonly description: string;
  readonly bdpUrl: string;
  readonly buildingPhoneNumber?: string;
  readonly walkScore?: { readonly walkscore: number };
  readonly transitScore?: { readonly transit_score: number };
  readonly bikeScore?: { readonly bikescore: number };
  readonly buildingAttributes?: {
    readonly appliances?: readonly string[];
    readonly petPolicies?: readonly string[];
  };
  readonly specialOffers?: readonly { readonly description: string }[];
  readonly isStudentHousing?: boolean;
}

const SEARCH_ACTOR_ID = 'maxcopell/zillow-scraper';
const DETAIL_ACTOR_ID = 'maxcopell/zillow-detail-scraper';

export async function runSearchScraper(
  token: string,
  searchUrl: string,
  maxItems?: number,
): Promise<readonly ZillowSearchResult[]> {
  const client = new ApifyClient({ token });

  const run = await client.actor(SEARCH_ACTOR_ID).call({
    searchUrls: [{ url: searchUrl }],
    maxItems,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return items as unknown as readonly ZillowSearchResult[];
}

export async function runDetailScraper(
  token: string,
  detailUrls: readonly string[],
): Promise<readonly ZillowDetailResult[]> {
  const client = new ApifyClient({ token });

  const run = await client.actor(DETAIL_ACTOR_ID).call({
    startUrls: detailUrls.map((url) => ({ url })),
    extractBuildingUnits: 'for_rent',
    propertyStatus: 'FOR_RENT',
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return items as unknown as readonly ZillowDetailResult[];
}
