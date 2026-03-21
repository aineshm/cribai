/**
 * Server-side listing data fetching from Supabase.
 * Uses the service-role client so listings are visible to all visitors
 * (the explore page is public, but RLS requires auth + campus_id).
 */

import { createSecretClient } from '@campusnest/supabase/server';
import { parseWkbPoint } from '@campusnest/utils';
import type { ExploreListing, ListingDetail, SubleaseDetails } from './listing-types';

/* ------------------------------------------------------------------ */
/*  Raw DB row shapes (snake_case from Supabase)                      */
/* ------------------------------------------------------------------ */

interface ListingRow {
  readonly id: string;
  readonly address: string;
  readonly rent_monthly: number;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly amenities: readonly string[] | null;
  readonly photo_urls: readonly string[] | null;
  readonly source: string;
  readonly source_url: string | null;
  readonly fairness_score: number | null;
  readonly available_date: string | null;
  readonly description: string | null;
  readonly raw_data: Record<string, unknown> | null;
  readonly location: string | null;
  readonly creator_id: string | null;
  readonly contact_email: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Derive a human-readable title from raw_data.buildingName or address */
function deriveTitle(row: ListingRow): string {
  const buildingName = row.raw_data?.buildingName as string | undefined;
  if (buildingName) return buildingName;

  // Fall back to a shortened address (street portion only)
  const parts = row.address.split(',');
  return parts[0]?.trim() ?? row.address;
}

/** Extract a numeric score from raw_data walk/bike/transit objects */
function extractScore(
  rawData: Record<string, unknown> | null,
  key: string
): number | null {
  if (!rawData?.[key]) return null;
  const obj = rawData[key] as Record<string, unknown>;
  // walkScore → walkscore, bikeScore → bikescore, transitScore → transit_score
  const scoreVal =
    obj.walkscore ?? obj.bikescore ?? obj.transit_score ?? null;
  return typeof scoreVal === 'number' ? scoreVal : null;
}

/** Normalize amenity strings for display (capitalize, deduplicate) */
function normalizeAmenities(raw: readonly string[] | null): readonly string[] {
  if (!raw || raw.length === 0) return [];
  return raw
    .filter((a) => a && a !== 'unknown')
    .map((a) => a.charAt(0).toUpperCase() + a.slice(1));
}

/** Build a description from available raw_data fields */
function buildDescription(row: ListingRow): string {
  const parts: string[] = [];

  const beds = row.bedrooms;
  const baths = row.bathrooms;
  const sqft = row.sqft;

  // Headline
  if (beds !== null || baths !== null) {
    const bedStr = beds === 0 ? 'Studio' : `${beds}-bedroom`;
    const bathStr = baths ? `, ${baths}-bathroom` : '';
    parts.push(`${bedStr}${bathStr} apartment at ${row.address}.`);
  } else {
    parts.push(`Apartment at ${row.address}.`);
  }

  if (sqft) parts.push(`${sqft.toLocaleString()} sqft.`);

  // Walk/bike/transit scores
  const walkScore = extractScore(row.raw_data, 'walkScore');
  const bikeScore = extractScore(row.raw_data, 'bikeScore');
  if (walkScore || bikeScore) {
    const scores: string[] = [];
    if (walkScore) scores.push(`Walk Score: ${walkScore}/100`);
    if (bikeScore) scores.push(`Bike Score: ${bikeScore}/100`);
    parts.push(scores.join(', ') + '.');
  }

  // Lease term
  const leaseTerm = row.raw_data?.leaseTerm as string | undefined;
  if (leaseTerm) parts.push(`Lease term: ${leaseTerm}.`);

  // Amenities
  const amenities = normalizeAmenities(row.amenities);
  if (amenities.length > 0) {
    parts.push(`Amenities: ${amenities.join(', ')}.`);
  }

  // Special offers
  const offers = row.raw_data?.specialOffers as
    | readonly { description: string }[]
    | undefined;
  if (offers && offers.length > 0) {
    const firstOffer = offers[0]?.description;
    if (firstOffer) {
      // Truncate long offers
      const cleaned = firstOffer.replace(/\n/g, ' ').trim();
      parts.push(cleaned.length > 200 ? cleaned.slice(0, 200) + '...' : cleaned);
    }
  }

  return parts.join(' ');
}

/** Extract sublease-specific fields from raw_data */
function extractSubleaseDetails(rawData: Record<string, unknown> | null): SubleaseDetails {
  if (!rawData) {
    return {
      bedroomsAvailable: null, leaseEnd: null, propertyType: null,
      furnished: null, parking: null, roommateInfo: null,
      genderRestriction: null, unitNumber: null,
    };
  }
  return {
    bedroomsAvailable: typeof rawData.bedrooms_available === 'number' ? rawData.bedrooms_available : null,
    leaseEnd: typeof rawData.lease_end === 'string' ? rawData.lease_end : null,
    propertyType: typeof rawData.property_type === 'string' ? rawData.property_type : null,
    furnished: typeof rawData.furnished === 'boolean' ? rawData.furnished : null,
    parking: typeof rawData.parking === 'boolean' ? rawData.parking : null,
    roommateInfo: typeof rawData.roommate_info === 'string' ? rawData.roommate_info : null,
    genderRestriction: typeof rawData.gender_restriction === 'string' ? rawData.gender_restriction : null,
    unitNumber: typeof rawData.unit_number === 'string' ? rawData.unit_number : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Map DB rows → UI types                                            */
/* ------------------------------------------------------------------ */

function toExploreListing(row: ListingRow): ExploreListing {
  const coords = parseWkbPoint(row.location);
  return {
    id: row.id,
    title: deriveTitle(row),
    address: row.address,
    price: Number(row.rent_monthly),
    beds: row.bedrooms,
    baths: row.bathrooms ? Number(row.bathrooms) : null,
    sqft: row.sqft ? Number(row.sqft) : null,
    photoUrl: row.photo_urls?.[0] ?? null,
    amenities: normalizeAmenities(row.amenities),
    source: row.source,
    sourceUrl: row.source_url,
    fairnessScore: row.fairness_score ? Number(row.fairness_score) : null,
    availableDate: row.available_date,
    walkScore: extractScore(row.raw_data, 'walkScore'),
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
  };
}

function toListingDetail(row: ListingRow): ListingDetail {
  return {
    id: row.id,
    title: deriveTitle(row),
    address: row.address,
    price: Number(row.rent_monthly),
    beds: row.bedrooms,
    baths: row.bathrooms ? Number(row.bathrooms) : null,
    sqft: row.sqft ? Number(row.sqft) : null,
    photoUrls: (row.photo_urls ?? []) as readonly string[],
    description: row.description?.trim() || buildDescription(row),
    amenities: normalizeAmenities(row.amenities),
    source: row.source,
    sourceUrl: row.source_url,
    fairnessScore: row.fairness_score ? Number(row.fairness_score) : null,
    availableDate: row.available_date,
    walkScore: extractScore(row.raw_data, 'walkScore'),
    bikeScore: extractScore(row.raw_data, 'bikeScore'),
    transitScore: extractScore(row.raw_data, 'transitScore'),
    leaseTerm: (row.raw_data?.leaseTerm as string) ?? null,
    buildingPhone: (row.raw_data?.buildingPhoneNumber as string) ?? null,
    specialOffers:
      ((row.raw_data?.specialOffers as readonly { description: string }[]) ?? [])
        .map((o) => o.description)
        .filter(Boolean),
    creatorId: row.creator_id ?? null,
    contactEmail: row.contact_email ?? null,
    ...(() => {
      const coords = parseWkbPoint(row.location);
      return {
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      };
    })(),
    subleaseDetails: row.source === 'sublease' ? extractSubleaseDetails(row.raw_data) : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

const EXPLORE_SELECT = [
  'id',
  'address',
  'rent_monthly',
  'bedrooms',
  'bathrooms',
  'sqft',
  'amenities',
  'photo_urls',
  'source',
  'source_url',
  'fairness_score',
  'available_date',
  'description',
  'raw_data',
  'location',
  'creator_id',
  'contact_email',
].join(', ');

/** Fetch active listings for the explore page (public, bypasses RLS) */
export async function fetchExploreListings(): Promise<readonly ExploreListing[]> {
  const supabase = createSecretClient();

  const { data, error } = await supabase
    .from('listings')
    .select(EXPLORE_SELECT)
    .eq('is_active', true)
    .gte('rent_monthly', 200)  // Filter out spam listings ($0, $1, $100 Craigslist junk)
    .order('fairness_score', { ascending: false, nullsFirst: false })
    .order('last_seen_at', { ascending: false })
    .limit(3000);

  if (error) {
    console.error('[listings-data] fetchExploreListings error:', error);
    return [];
  }

  return (data as unknown as readonly ListingRow[]).map(toExploreListing);
}

/** Fetch a single listing by ID for the detail page (public, bypasses RLS) */
export async function fetchListingById(
  id: string
): Promise<ListingDetail | null> {
  const supabase = createSecretClient();

  const { data, error } = await supabase
    .from('listings')
    .select(EXPLORE_SELECT)
    .eq('id', id)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.error('[listings-data] fetchListingById error:', error);
    return null;
  }

  return toListingDetail(data as unknown as ListingRow);
}
