/**
 * UI-friendly listing types mapped from the Supabase `listings` table.
 * These replace the mock-listings interfaces with real data shapes.
 */

/** Listing card data for the Explore page grid */
export interface ExploreListing {
  readonly id: string;
  readonly title: string;
  readonly address: string;
  readonly price: number;
  readonly beds: number | null;
  readonly baths: number | null;
  readonly sqft: number | null;
  readonly photoUrl: string | null;
  readonly amenities: readonly string[];
  readonly source: string;
  readonly sourceUrl: string | null;
  readonly fairnessScore: number | null;
  readonly availableDate: string | null;
  readonly walkScore: number | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

/** Full listing data for the detail page */
export interface ListingDetail {
  readonly id: string;
  readonly title: string;
  readonly address: string;
  readonly price: number;
  readonly beds: number | null;
  readonly baths: number | null;
  readonly sqft: number | null;
  readonly photoUrls: readonly string[];
  readonly description: string;
  readonly amenities: readonly string[];
  readonly source: string;
  readonly sourceUrl: string | null;
  readonly fairnessScore: number | null;
  readonly availableDate: string | null;
  readonly walkScore: number | null;
  readonly bikeScore: number | null;
  readonly transitScore: number | null;
  readonly leaseTerm: string | null;
  readonly buildingPhone: string | null;
  readonly specialOffers: readonly string[];
  readonly creatorId: string | null;
  readonly contactEmail: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}
