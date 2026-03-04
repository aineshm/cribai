import type { RawListing } from './scrapers/base-scraper';

export interface NormalizedListing {
  readonly externalId: string;
  readonly source: string;
  readonly address: string;
  readonly rentMonthly: number;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly amenities: readonly string[];
  readonly availableDate: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly rawData: Record<string, unknown>;
}

const AMENITY_ALIASES: Record<string, string> = {
  'w/d': 'washer_dryer',
  'washer/dryer': 'washer_dryer',
  'in-unit laundry': 'washer_dryer',
  'a/c': 'air_conditioning',
  'central air': 'air_conditioning',
  'dishwasher': 'dishwasher',
  'parking': 'parking',
  'garage': 'parking',
  'gym': 'fitness_center',
  'fitness': 'fitness_center',
  'pool': 'pool',
  'pet friendly': 'pets_allowed',
  'cats allowed': 'pets_allowed',
  'dogs allowed': 'pets_allowed',
};

function normalizeAmenity(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return AMENITY_ALIASES[lower] ?? lower.replace(/\s+/g, '_');
}

export function normalizeListing(raw: RawListing): NormalizedListing {
  return {
    externalId: raw.externalId,
    source: raw.source,
    address: raw.address.trim(),
    rentMonthly: Math.round(raw.rentMonthly * 100) / 100,
    bedrooms: raw.bedrooms,
    bathrooms: raw.bathrooms,
    sqft: raw.sqft,
    amenities: [...new Set(raw.amenities.map(normalizeAmenity))],
    availableDate: raw.availableDate,
    latitude: raw.latitude,
    longitude: raw.longitude,
    rawData: raw.rawData,
  };
}
