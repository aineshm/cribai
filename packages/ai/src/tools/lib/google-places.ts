/**
 * Google Places API (New) client.
 * Uses the v1 REST API with field masks for efficient queries.
 */

const BASE_URL = 'https://places.googleapis.com/v1';

export interface PlaceReview {
  readonly rating: number;
  readonly text: { readonly text: string };
  readonly authorAttribution: { readonly displayName: string };
  readonly relativePublishTimeDescription: string;
  readonly publishTime: string;
}

export interface PlaceDetailsResult {
  readonly id: string;
  readonly displayName: { readonly text: string };
  readonly rating: number;
  readonly userRatingCount: number;
  readonly reviews: readonly PlaceReview[];
}

export interface NearbyPlace {
  readonly displayName: { readonly text: string };
  readonly formattedAddress: string;
  readonly types: readonly string[];
  readonly location: { readonly latitude: number; readonly longitude: number };
}

/**
 * Search for a place by text query (typically an address).
 * Returns the first matching place ID, or null if no results.
 */
export async function textSearchPlace(
  address: string,
  apiKey: string,
): Promise<string | null> {
  const response = await fetch(`${BASE_URL}/places:searchText`, {
    method: 'POST',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ textQuery: address }),
  });

  if (!response.ok) {
    throw new Error(
      `Google Places textSearch failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json() as { places?: Array<{ id: string }> };
  const places = data.places ?? [];

  return places.length > 0 ? places[0]!.id : null;
}

/**
 * Get detailed information about a place by its ID.
 * Throws on non-OK response.
 */
export async function getPlaceDetails(
  placeId: string,
  apiKey: string,
  fieldMask: string,
): Promise<PlaceDetailsResult> {
  const response = await fetch(`${BASE_URL}/places/${placeId}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Google Places getDetails failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<PlaceDetailsResult>;
}

/**
 * Search for places near a location within a radius.
 * Returns an array of nearby places matching the given types.
 */
export async function nearbySearch(
  lat: number,
  lon: number,
  radiusMeters: number,
  includedTypes: readonly string[],
  apiKey: string,
): Promise<readonly NearbyPlace[]> {
  const response = await fetch(`${BASE_URL}/places:searchNearby`, {
    method: 'POST',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.displayName,places.formattedAddress,places.types,places.location',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      includedTypes,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lon },
          radius: radiusMeters,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Google Places nearbySearch failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json() as { places?: readonly NearbyPlace[] };
  return data.places ?? [];
}
