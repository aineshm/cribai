import { BaseScraper, type RawListing } from './base-scraper';

const MAX_RESULTS = 20;

interface PlaceResult {
  readonly id: string;
  readonly displayName?: { readonly text: string };
  readonly formattedAddress?: string;
  readonly location?: { readonly latitude: number; readonly longitude: number };
  readonly websiteUri?: string;
  readonly photos?: ReadonlyArray<{ readonly name: string }>;
  readonly rating?: number;
  readonly userRatingCount?: number;
  readonly nationalPhoneNumber?: string;
}

interface NearbySearchResponse {
  readonly places?: readonly PlaceResult[];
}

export class GooglePlacesScraper extends BaseScraper {
  readonly source = 'google_places';

  async scrape(): Promise<readonly RawListing[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.log(`[${this.source}] GOOGLE_PLACES_API_KEY not set — skipping`);
      return [];
    }

    const radiusMeters = this.config.radiusKm * 1000;

    console.log(`[${this.source}] Searching near (${this.config.latitude}, ${this.config.longitude}) radius ${radiusMeters}m`);

    const body = {
      includedTypes: ['apartment_complex', 'real_estate_agency'],
      locationRestriction: {
        circle: {
          center: {
            latitude: this.config.latitude,
            longitude: this.config.longitude,
          },
          radius: Math.min(radiusMeters, 50000), // API max 50km
        },
      },
      maxResultCount: MAX_RESULTS,
    };

    const fieldMask = [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.location',
      'places.websiteUri',
      'places.photos',
      'places.rating',
      'places.userRatingCount',
      'places.nationalPhoneNumber',
    ].join(',');

    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchNearby',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${this.source}] API error ${response.status}: ${errorText}`);
      return [];
    }

    const data: NearbySearchResponse = await response.json();
    const places = data.places ?? [];
    console.log(`[${this.source}] Found ${places.length} places`);

    const listings: RawListing[] = [];

    for (const place of places) {
      const name = place.displayName?.text;
      if (!name) continue;

      // Resolve photo URLs (up to 3)
      const photoUrls = await this.resolvePhotos(place.photos?.slice(0, 3) ?? [], apiKey);

      listings.push({
        externalId: `gp_${place.id}`,
        source: this.source,
        address: place.formattedAddress ?? name,
        rentMonthly: null, // Places API doesn't provide rent
        bedrooms: null,
        bathrooms: null,
        sqft: null,
        amenities: [],
        availableDate: null,
        latitude: place.location?.latitude ?? null,
        longitude: place.location?.longitude ?? null,
        rawData: {
          scrapedAt: new Date().toISOString(),
          websiteUri: place.websiteUri ?? null,
          rating: place.rating ?? null,
          userRatingCount: place.userRatingCount ?? null,
          phone: place.nationalPhoneNumber ?? null,
          placeId: place.id,
        },
        photoUrls,
        sourceUrl: place.websiteUri ?? `https://www.google.com/maps/place/?q=place_id:${place.id}`,
      });
    }

    return listings;
  }

  private async resolvePhotos(
    photos: ReadonlyArray<{ readonly name: string }>,
    apiKey: string,
  ): Promise<string[]> {
    const urls: string[] = [];
    for (const photo of photos) {
      // New Places API photo URL format
      const url = `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=800&key=${apiKey}`;
      urls.push(url);
    }
    return urls;
  }
}
