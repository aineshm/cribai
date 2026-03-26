/**
 * UI-friendly listing types mapped from the Supabase `listings` table.
 * These replace the mock-listings interfaces with real data shapes.
 */

import type { NearestLandmark } from './campus-landmarks';

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
  /** Pre-computed true monthly cost (rent + utilities + parking + fees) */
  readonly trueCostTotal: number | null;
  /** Fairness comparison data from comparable listings */
  readonly fairnessData: FairnessData | null;
  /** Nearest campus landmark (computed client-side from coordinates) */
  readonly nearestLandmark: NearestLandmark | null;
  /** Sublease-specific fields from raw_data */
  readonly subleaseDetails: SubleaseDetails | null;
  /** Property details for non-sublease (scraped) listings */
  readonly propertyDetails: PropertyDetails | null;
}

/** Fairness comparison data stored in the fairness_data JSONB column */
export interface FairnessData {
  readonly comparableCount: number;
  readonly percentile: number;
  readonly predictedRent: number;
  /** Percent delta from predicted rent (negative = cheaper) */
  readonly delta: number;
  readonly breakdown?: {
    readonly mean: number;
    readonly median: number;
    readonly min: number;
    readonly max: number;
    readonly score: number;
  };
}

/** Sublease-specific metadata extracted from raw_data */
export interface SubleaseDetails {
  readonly bedroomsAvailable: number | null;
  readonly leaseEnd: string | null;
  readonly propertyType: string | null;
  readonly furnished: boolean | null;
  readonly parking: boolean | null;
  readonly roommateInfo: string | null;
  readonly genderRestriction: string | null;
  readonly unitNumber: string | null;
}

/** Property details for non-sublease (scraped) listings */
export interface PropertyDetails {
  readonly depositFeeMin: number | null;
  readonly depositFeeMax: number | null;
  readonly applicationFee: number | null;
  readonly petPolicy: string | null;
  readonly walkScoreDescription: string | null;
  readonly bikeScoreDescription: string | null;
  readonly transitScoreDescription: string | null;
  readonly isStudentHousing: boolean | null;
}
