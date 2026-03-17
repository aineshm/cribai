/**
 * Geocode an address to lat/lng coordinates using Google Places API.
 * Returns null on any failure (no match, API error, missing location).
 */
import { textSearchPlace, getPlaceDetails } from './google-places';

export interface GeocodeResult {
  readonly latitude: number;
  readonly longitude: number;
}

export async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<GeocodeResult | null> {
  try {
    const placeId = await textSearchPlace(address, apiKey);
    if (!placeId) {
      return null;
    }

    const details = await getPlaceDetails(placeId, apiKey, 'location');
    if (!details.location) {
      return null;
    }

    return {
      latitude: details.location.latitude,
      longitude: details.location.longitude,
    };
  } catch {
    return null;
  }
}
