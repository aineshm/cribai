export interface RawListing {
  readonly externalId: string;
  readonly source: string;
  readonly address: string;
  readonly rentMonthly: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly amenities: readonly string[];
  readonly availableDate: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly rawData: Record<string, unknown>;
  readonly photoUrls: readonly string[];
  readonly sourceUrl: string;
}

export interface ScraperConfig {
  readonly campusId: string;
  readonly campusSlug: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusKm: number;
}

export abstract class BaseScraper {
  protected readonly config: ScraperConfig;

  constructor(config: ScraperConfig) {
    this.config = config;
  }

  abstract readonly source: string;
  abstract scrape(): Promise<readonly RawListing[]>;
}
