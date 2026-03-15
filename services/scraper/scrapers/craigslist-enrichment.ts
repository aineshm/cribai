import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import type { RawListing } from './base-scraper';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 2000;
const DETAIL_FETCH_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (response.ok) {
        return await response.text();
      }

      console.warn(
        `[craigslist-enrich] HTTP ${response.status} for ${url} (attempt ${attempt + 1}/${retries + 1})`,
      );
    } catch (err) {
      console.warn(
        `[craigslist-enrich] Fetch error for ${url} (attempt ${attempt + 1}/${retries + 1}):`,
        err instanceof Error ? err.message : err,
      );
    }

    if (attempt < retries) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await sleep(backoff);
    }
  }

  return null;
}

/** Data extracted from a Craigslist detail page via cheerio */
export interface DetailPageData {
  readonly photoUrls: readonly string[];
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly description: string | null;
  readonly postedDate: string | null;
}

/**
 * Parse a Craigslist detail page HTML to extract structured data.
 */
export function parseDetailPage(html: string): DetailPageData {
  const $ = cheerio.load(html);

  // Photos: try multiple selectors for different CL page structures
  const photoUrls: string[] = [];
  // Thumbstrip images
  $('#thumbs a').each((_, el) => {
    const href = $(el).attr('href');
    if (href) photoUrls.push(href);
  });
  // Gallery images (alternative structure)
  if (photoUrls.length === 0) {
    $('.gallery img, .swipe img').each((_, el) => {
      const src = $(el).attr('src');
      if (src && !src.includes('00000_')) photoUrls.push(src);
    });
  }
  // Multi-image viewer
  if (photoUrls.length === 0) {
    $('img[title]').each((_, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('images.craigslist.org')) photoUrls.push(src);
    });
  }

  // Coordinates from map element
  const mapEl = $('#map');
  const latStr = mapEl.attr('data-latitude');
  const lngStr = mapEl.attr('data-longitude');
  const latitude = latStr ? parseFloat(latStr) : null;
  const longitude = lngStr ? parseFloat(lngStr) : null;

  // Description from posting body
  const postingBody = $('#postingbody').clone();
  postingBody.find('.print-information, .print-qrcode-container').remove();
  const description = postingBody.text().trim() || null;

  // Posted date
  const timeEl = $('time.date[datetime]');
  const postedDate = timeEl.attr('datetime') ?? null;

  return {
    photoUrls,
    latitude: latitude !== null && !isNaN(latitude) ? latitude : null,
    longitude: longitude !== null && !isNaN(longitude) ? longitude : null,
    description,
    postedDate,
  };
}

/** Structured data extracted from description via LLM */
export interface LLMExtractedFields {
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly amenities: readonly string[];
  readonly availableDate: string | null;
  readonly petPolicy: string | null;
  readonly parking: string | null;
  readonly furnished: boolean | null;
}

const EXTRACTION_PROMPT = `Extract structured data from this Craigslist listing description. Return ONLY valid JSON matching this schema:
{
  "bedrooms": number or null,
  "bathrooms": number or null,
  "amenities": ["string array of amenities like laundry, dishwasher, AC, etc."],
  "availableDate": "YYYY-MM-DD or null",
  "petPolicy": "cats ok, dogs ok, no pets, or null",
  "parking": "garage, street, off-street, included, or null",
  "furnished": true/false/null
}

Description:
`;

/**
 * Use Gemini to extract structured fields from a listing description.
 */
async function extractWithLLM(
  description: string,
  gemini: GoogleGenAI,
): Promise<LLMExtractedFields> {
  const defaultResult: LLMExtractedFields = {
    bedrooms: null,
    bathrooms: null,
    amenities: [],
    availableDate: null,
    petPolicy: null,
    parking: null,
    furnished: null,
  };

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `${EXTRACTION_PROMPT}${description.slice(0, 2000)}`,
    });

    const text = response.text ?? '';
    // Extract JSON from response (may be wrapped in ```json blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return defaultResult;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      bedrooms: typeof parsed.bedrooms === 'number' ? parsed.bedrooms : null,
      bathrooms: typeof parsed.bathrooms === 'number' ? parsed.bathrooms : null,
      amenities: Array.isArray(parsed.amenities)
        ? parsed.amenities.filter((a): a is string => typeof a === 'string')
        : [],
      availableDate: typeof parsed.availableDate === 'string' ? parsed.availableDate : null,
      petPolicy: typeof parsed.petPolicy === 'string' ? parsed.petPolicy : null,
      parking: typeof parsed.parking === 'string' ? parsed.parking : null,
      furnished: typeof parsed.furnished === 'boolean' ? parsed.furnished : null,
    };
  } catch (err) {
    console.warn('[craigslist-enrich] LLM extraction failed:', err instanceof Error ? err.message : err);
    return defaultResult;
  }
}

/**
 * Determine if a listing has sparse data that would benefit from LLM extraction.
 */
function isSparse(listing: RawListing): boolean {
  return listing.bedrooms === null && listing.amenities.length === 0;
}

/**
 * Create a Gemini client for LLM enrichment.
 * Returns null if no API key is configured.
 */
function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[craigslist-enrich] GEMINI_API_KEY not set — skipping LLM enrichment');
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Enrich a batch of Craigslist listings by fetching their detail pages
 * and optionally running LLM extraction on sparse listings.
 */
export async function enrichListings(
  listings: readonly RawListing[],
): Promise<readonly RawListing[]> {
  if (listings.length === 0) return listings;

  console.log(`[craigslist-enrich] Enriching ${listings.length} listings from detail pages`);

  const gemini = createGeminiClient();
  let enrichedCount = 0;
  let llmCount = 0;

  const enriched: RawListing[] = [];

  for (const listing of listings) {
    if (!listing.sourceUrl) {
      enriched.push(listing);
      continue;
    }

    // Rate limit between fetches
    if (enrichedCount > 0) {
      const delay = DETAIL_FETCH_DELAY_MS + Math.random() * 500;
      await sleep(delay);
    }

    const html = await fetchWithRetry(listing.sourceUrl);
    if (!html) {
      enriched.push(listing);
      enrichedCount++;
      continue;
    }

    const detail = parseDetailPage(html);

    // Merge detail page data — only override null values
    let merged: RawListing = {
      ...listing,
      photoUrls: detail.photoUrls.length > 0 ? detail.photoUrls : listing.photoUrls,
      latitude: detail.latitude ?? listing.latitude,
      longitude: detail.longitude ?? listing.longitude,
      rawData: {
        ...listing.rawData,
        description: detail.description,
        postedDate: detail.postedDate,
      },
    };

    // LLM extraction for sparse listings
    if (gemini && detail.description && isSparse(merged)) {
      const extracted = await extractWithLLM(detail.description, gemini);
      merged = {
        ...merged,
        bedrooms: extracted.bedrooms ?? merged.bedrooms,
        bathrooms: extracted.bathrooms ?? merged.bathrooms,
        amenities: extracted.amenities.length > 0 ? extracted.amenities : merged.amenities,
        availableDate: extracted.availableDate ?? merged.availableDate,
        rawData: {
          ...merged.rawData,
          petPolicy: extracted.petPolicy,
          parking: extracted.parking,
          furnished: extracted.furnished,
        },
      };
      llmCount++;
    }

    enriched.push(merged);
    enrichedCount++;
  }

  console.log(
    `[craigslist-enrich] Done: ${enrichedCount} detail pages fetched, ${llmCount} LLM extractions`,
  );

  return enriched;
}
