/**
 * Server-side listing data fetching from Supabase.
 * Uses the service-role client so listings are visible to all visitors
 * (the explore page is public, but RLS requires auth + campus_id).
 */

import { createSecretClient } from '@campusnest/supabase/server';
import { parseWkbPoint } from '@campusnest/utils';
import { findNearestLandmark } from './campus-landmarks';
import type { ExploreListing, FairnessData, ListingDetail, PropertyDetails, SubleaseDetails } from './listing-types';

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
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly creator_id: string | null;
  readonly contact_email: string | null;
  readonly true_cost_total: number | null;
  readonly fairness_data: Record<string, unknown> | null;
  readonly campus_id?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Derive a human-readable title from listing data */
/** Strip junk text from scraped titles/addresses (e.g. "google map🔗") */
function sanitizeText(text: string): string {
  return text
    .replace(/google\s*map[🔗\uD83D\uDD17]?/gi, '')
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, '') // strip all emoji
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function deriveTitle(row: ListingRow): string {
  const buildingName = row.raw_data?.buildingName as string | undefined;
  if (buildingName) {
    const clean = sanitizeText(buildingName);
    if (clean) return clean;
  }

  // For subleases, build a descriptive title from beds + street
  const street = sanitizeText(row.address.split(',')[0]?.trim() ?? row.address);
  if (row.source === 'sublease') {
    const beds = row.bedrooms === null || row.bedrooms === undefined
      ? ''
      : row.bedrooms === 0
        ? 'Studio'
        : `${row.bedrooms}BR`;
    return beds ? `${beds} Sublease at ${street}` : `Sublease at ${street}`;
  }

  return street;
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

/** Known amenity key → human-readable label */
const AMENITY_LABELS: Record<string, string> = {
  'w/d_in_unit': 'Washer/Dryer In Unit',
  'w/d in unit': 'Washer/Dryer In Unit',
  'off-street_parking': 'Off-Street Parking',
  'off_street_parking': 'Off-Street Parking',
  'cats_are_ok_-_purrr': 'Cats OK',
  'cats_are_ok': 'Cats OK',
  'dogs_are_ok_-_wooof': 'Dogs OK',
  'no_smoking': 'No Smoking',
  'rent_period:': 'Rent Period',
  'rent_period': 'Rent Period',
  'in_unit_laundry': 'In-Unit Laundry',
  'street_parking': 'Street Parking',
  'ev_charging': 'EV Charging',
  'air_conditioning': 'Air Conditioning',
  'wheelchair_accessible': 'Wheelchair Accessible',
};

/** Normalize amenity strings for display */
function normalizeAmenities(raw: readonly string[] | null): readonly string[] {
  if (!raw || raw.length === 0) return [];
  return raw
    .filter((a) => a && a !== 'unknown')
    .map((a) => {
      const lower = a.toLowerCase().trim();
      if (AMENITY_LABELS[lower]) return AMENITY_LABELS[lower];
      return a
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    });
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
    parts.push(`${bedStr}${bathStr} apartment at ${sanitizeText(row.address)}.`);
  } else {
    parts.push(`Apartment at ${sanitizeText(row.address)}.`);
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

/** Parse fairness_data JSONB into typed FairnessData or null */
function parseFairnessData(raw: Record<string, unknown> | null): FairnessData | null {
  if (!raw) return null;
  const comparableCount = typeof raw.comparableCount === 'number' ? raw.comparableCount : null;
  const percentile = typeof raw.percentile === 'number' ? raw.percentile : null;
  const predictedRent = typeof raw.predictedRent === 'number' ? raw.predictedRent : null;
  const delta = typeof raw.delta === 'number' ? raw.delta : null;

  if (comparableCount === null || percentile === null || predictedRent === null || delta === null) {
    return null;
  }

  const breakdown = raw.breakdown as Record<string, unknown> | undefined;
  const parsedBreakdown = breakdown && typeof breakdown.score === 'number'
    ? {
        mean: typeof breakdown.mean === 'number' ? breakdown.mean : 0,
        median: typeof breakdown.median === 'number' ? breakdown.median : 0,
        min: typeof breakdown.min === 'number' ? breakdown.min : 0,
        max: typeof breakdown.max === 'number' ? breakdown.max : 0,
        score: breakdown.score,
      }
    : undefined;

  return { comparableCount, percentile, predictedRent, delta, breakdown: parsedBreakdown };
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

/** Extract property details from raw_data for scraped listings */
function extractPropertyDetails(rawData: Record<string, unknown> | null): PropertyDetails {
  if (!rawData) {
    return {
      depositFeeMin: null, depositFeeMax: null, applicationFee: null,
      petPolicy: null, walkScoreDescription: null, bikeScoreDescription: null,
      transitScoreDescription: null, isStudentHousing: null,
    };
  }
  // Zillow stores fee/deposit info under buildingAttributes; check both locations
  const attrs = rawData.buildingAttributes as Record<string, unknown> | undefined;

  const depositMin = typeof rawData.depositFeeMin === 'number'
    ? rawData.depositFeeMin
    : typeof attrs?.depositFeeMin === 'number' ? attrs.depositFeeMin : null;
  const depositMax = typeof rawData.depositFeeMax === 'number'
    ? rawData.depositFeeMax
    : typeof attrs?.depositFeeMax === 'number' ? attrs.depositFeeMax : null;
  const appFee = typeof rawData.applicationFee === 'number'
    ? rawData.applicationFee
    : typeof attrs?.applicationFee === 'number' ? attrs.applicationFee : null;

  // Build a short pet policy string from petPolicies array
  let petPolicy: string | null = null;
  const petPolicies = (rawData.petPolicies ?? attrs?.petPolicies) as readonly string[] | undefined;
  if (petPolicies && petPolicies.length > 0) {
    const labels = petPolicies.map((p: string) =>
      p.replace(/([A-Z])/g, ' $1').trim(),
    );
    petPolicy = labels.join(', ');
  }

  const walkObj = rawData.walkScore as Record<string, unknown> | undefined;
  const bikeObj = rawData.bikeScore as Record<string, unknown> | undefined;
  const transitObj = rawData.transitScore as Record<string, unknown> | undefined;

  return {
    depositFeeMin: depositMin as number | null,
    depositFeeMax: depositMax as number | null,
    applicationFee: appFee as number | null,
    petPolicy,
    walkScoreDescription: typeof walkObj?.description === 'string' ? walkObj.description : null,
    bikeScoreDescription: typeof bikeObj?.description === 'string' ? bikeObj.description : null,
    transitScoreDescription: typeof transitObj?.description === 'string' ? transitObj.description : null,
    isStudentHousing: typeof rawData.isStudentHousing === 'boolean' ? rawData.isStudentHousing : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Map DB rows → UI types                                            */
/* ------------------------------------------------------------------ */

function toExploreListing(row: ListingRow): ExploreListing {
  // Prefer DB generated columns (latitude/longitude) over WKB parsing — more reliable
  const lat = row.latitude != null ? Number(row.latitude) : null;
  const lng = row.longitude != null ? Number(row.longitude) : null;
  // Fallback to WKB parsing only if generated columns are missing
  const coords = (lat != null && lng != null) ? { latitude: lat, longitude: lng } : parseWkbPoint(row.location);
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
  // Resolve coordinates once for reuse (latitude/longitude + nearestLandmark)
  const lat = row.latitude != null ? Number(row.latitude) : null;
  const lng = row.longitude != null ? Number(row.longitude) : null;
  const coords = (lat != null && lng != null)
    ? { latitude: lat, longitude: lng }
    : parseWkbPoint(row.location);
  const resolvedLat = coords?.latitude ?? null;
  const resolvedLng = coords?.longitude ?? null;

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
    latitude: resolvedLat,
    longitude: resolvedLng,
    nearestLandmark: (resolvedLat != null && resolvedLng != null)
      ? findNearestLandmark(resolvedLat, resolvedLng)
      : null,
    trueCostTotal: row.true_cost_total ? Number(row.true_cost_total) : null,
    fairnessData: parseFairnessData(row.fairness_data),
    subleaseDetails: row.source === 'sublease' ? extractSubleaseDetails(row.raw_data) : null,
    propertyDetails: row.source !== 'sublease' ? extractPropertyDetails(row.raw_data) : null,
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
  'latitude',
  'longitude',
  'creator_id',
  'contact_email',
  'true_cost_total',
  'fairness_data',
].join(', ');

/** Fetch active listings for the explore page (public, bypasses RLS) */
export async function fetchExploreListings(): Promise<readonly ExploreListing[]> {
  const supabase = createSecretClient();

  const { data, error } = await supabase
    .from('listings')
    .select(EXPLORE_SELECT)
    .eq('source', 'sublease')  // AIN-63: discovery surfaces show student subleases only
    .eq('is_active', true)
    .gte('rent_monthly', 200)  // Filter out spam listings ($0, $1, $100 Craigslist junk)
    .not('location', 'is', null)  // Only listings with coordinates (map + grid need them)
    .order('fairness_score', { ascending: false, nullsFirst: false })
    .order('last_seen_at', { ascending: false })
    .range(0, 2999);

  if (error) {
    console.error('[listings-data] fetchExploreListings error:', error);
    return [];
  }

  return (data as unknown as readonly ListingRow[]).map(toExploreListing);
}

export interface ExploreViewportBounds {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

export async function fetchFeaturedExploreListings(limit = 12): Promise<readonly ExploreListing[]> {
  const supabase = createSecretClient();

  const { data, error } = await supabase
    .from('listings')
    .select(EXPLORE_SELECT)
    .eq('source', 'sublease')  // AIN-63: featured grid shows student subleases only
    .eq('is_active', true)
    .gte('rent_monthly', 200)
    .order('fairness_score', { ascending: false, nullsFirst: false })
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[listings-data] fetchFeaturedExploreListings error:', error);
    return [];
  }

  return (data as unknown as readonly ListingRow[]).map(toExploreListing);
}

export async function fetchViewportExploreListings(args: {
  readonly bounds: ExploreViewportBounds;
  readonly campusId?: string | null;
  readonly limit?: number;
}): Promise<readonly ExploreListing[]> {
  const supabase = createSecretClient();
  const limit = Math.max(1, Math.min(args.limit ?? 250, 250));

  let query = supabase
    .from('listings')
    .select(EXPLORE_SELECT)
    .eq('source', 'sublease')  // AIN-63: map viewport shows student subleases only
    .eq('is_active', true)
    .gte('rent_monthly', 200)
    .gte('latitude', args.bounds.minLat)
    .lte('latitude', args.bounds.maxLat)
    .gte('longitude', args.bounds.minLng)
    .lte('longitude', args.bounds.maxLng)
    .order('fairness_score', { ascending: false, nullsFirst: false })
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (args.campusId) {
    query = query.eq('campus_id', args.campusId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[listings-data] fetchViewportExploreListings error:', error);
    return [];
  }

  return (data as unknown as readonly ListingRow[]).map(toExploreListing);
}

/**
 * Fetch a single listing by ID for the detail page (public, bypasses RLS).
 * Intentionally NOT filtered to source='sublease' (AIN-63): scraped listings are
 * demoted from discovery, not reachability — old links/conversations must not 404.
 */
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
