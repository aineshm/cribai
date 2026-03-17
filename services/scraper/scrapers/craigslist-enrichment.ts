import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import type { RawListing } from './base-scraper';

// Browser-realistic User-Agent
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Browser-realistic headers (mirrors apartments-com.ts)
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

// Detail page enrichment limits
const MAX_DETAIL_PAGES = 50;
const DETAIL_DELAY_MIN_MS = 3000;
const DETAIL_DELAY_MAX_MS = 7000;
const DETAIL_MAX_RETRIES = 1;
const MAX_PHOTOS_PER_LISTING = 10;

// Block detection patterns (case-insensitive check against response text)
const BLOCK_SIGNALS = ['blocked', 'captcha', 'verify you are human'] as const;

// Retry config for search page fetches (preserved from original)
const SEARCH_MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random delay between min and max milliseconds (inclusive).
 */
function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a URL with retries and browser-realistic headers.
 * Returns the response body text, or null on failure.
 */
export async function fetchWithRetry(url: string, retries = SEARCH_MAX_RETRIES): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers: BROWSER_HEADERS });

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

/**
 * Check if a response body contains signals that Craigslist is blocking us.
 */
export function detectBlock(html: string): boolean {
  const lower = html.toLowerCase();
  return BLOCK_SIGNALS.some((signal) => lower.includes(signal));
}

/** Data extracted from a Craigslist detail page via cheerio */
export interface DetailPageData {
  readonly photoUrls: readonly string[];
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly address: string | null;
  readonly bathrooms: number | null;
  readonly amenities: readonly string[];
  readonly description: string | null;
  readonly postedDate: string | null;
}

/**
 * Parse a Craigslist detail page HTML to extract structured data.
 * Extracts: photos, lat/lng, address, bathrooms, amenities, description, posted date.
 */
export function parseDetailPage(html: string): DetailPageData {
  const $ = cheerio.load(html);

  // --- Photos ---
  // Try multiple selectors for different CL page structures
  const rawPhotoUrls: string[] = [];

  // Thumbstrip images (most common)
  $('#thumbs a').each((_, el) => {
    const href = $(el).attr('href');
    if (href) rawPhotoUrls.push(href);
  });

  // Gallery / swipe images (alternative structure)
  if (rawPhotoUrls.length === 0) {
    $('.gallery img, .swipe img').each((_, el) => {
      const src = $(el).attr('src');
      if (src && !src.includes('00000_')) rawPhotoUrls.push(src);
    });
  }

  // Multi-image viewer with title attribute
  if (rawPhotoUrls.length === 0) {
    $('img[title]').each((_, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('images.craigslist.org')) rawPhotoUrls.push(src);
    });
  }

  // Deduplicate and cap at MAX_PHOTOS_PER_LISTING
  const photoUrls = [...new Set(rawPhotoUrls)].slice(0, MAX_PHOTOS_PER_LISTING);

  // --- Coordinates from #map element ---
  const mapEl = $('#map');
  const latStr = mapEl.attr('data-latitude');
  const lngStr = mapEl.attr('data-longitude');
  const rawLat = latStr ? parseFloat(latStr) : null;
  const rawLng = lngStr ? parseFloat(lngStr) : null;
  const latitude = rawLat !== null && !isNaN(rawLat) ? rawLat : null;
  const longitude = rawLng !== null && !isNaN(rawLng) ? rawLng : null;

  // --- Address from .mapaddress or h2 fallback ---
  const mapAddress = $('.mapaddress').text().trim();
  const titleAddress = $('h2.postingtitletext').text().trim();
  const address = mapAddress || titleAddress || null;

  // --- Bathrooms from .attrgroup text ---
  const attrText = $('.attrgroup').text();
  const bathMatch = attrText.match(/(\d+(?:\.\d+)?)\s*(?:bath|ba)/i);
  const bathrooms = bathMatch?.[1] ? parseFloat(bathMatch[1]) : null;

  // --- Amenities from .attrgroup span elements ---
  const amenities: string[] = [];
  $('.attrgroup span').each((_, el) => {
    const text = $(el).text().trim();
    // Skip entries that look like bed/bath counts (already parsed above)
    if (text && !/^\d+(?:\.\d+)?\s*(?:br|ba|bed|bath|ft2?)/i.test(text)) {
      amenities.push(text.toLowerCase().replace(/\s+/g, '_'));
    }
  });

  // --- Description from posting body ---
  const postingBody = $('#postingbody').clone();
  postingBody.find('.print-information, .print-qrcode-container').remove();
  const description = postingBody.text().trim() || null;

  // --- Posted date ---
  const timeEl = $('time.date[datetime]');
  const postedDate = timeEl.attr('datetime') ?? null;

  return {
    photoUrls,
    latitude,
    longitude,
    address,
    bathrooms,
    amenities,
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
      availableDate: typeof parsed.availableDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.availableDate)
        ? parsed.availableDate
        : null,
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
 * Enrich a batch of Craigslist listings by fetching their detail pages.
 *
 * Adds: lat/lng, real address, bathrooms, amenities, photos.
 * Conservative rate limiting (3-7s delay) with block detection that
 * halts the loop early to avoid bans. Caps at maxPages detail fetches.
 */
export async function enrichListings(
  listings: readonly RawListing[],
  maxPages: number = MAX_DETAIL_PAGES,
): Promise<readonly RawListing[]> {
  if (listings.length === 0) return listings;

  // Only enrich listings that have a sourceUrl, up to the cap
  const enrichable = listings.filter((l) => !!l.sourceUrl);
  const toEnrich = enrichable.slice(0, maxPages);
  const skippedUrls = new Set(
    enrichable.slice(maxPages).map((l) => l.sourceUrl),
  );

  console.log(
    `[craigslist-enrich] Enriching ${toEnrich.length}/${listings.length} listings from detail pages (cap: ${maxPages})`,
  );

  const gemini = createGeminiClient();
  let fetchedCount = 0;
  let failedCount = 0;
  let consecutiveFailures = 0;
  let llmCount = 0;
  let blocked = false;

  // Max consecutive fetch failures before treating as a soft block
  const MAX_CONSECUTIVE_FAILURES = 3;

  // Map sourceUrl -> enriched data for fast lookup
  const enrichedMap = new Map<string, DetailPageData>();

  for (let i = 0; i < toEnrich.length; i++) {
    const listing = toEnrich[i]!;

    // Random delay before each fetch (3-7s), including the first
    await randomDelay(DETAIL_DELAY_MIN_MS, DETAIL_DELAY_MAX_MS);

    const html = await fetchWithRetry(listing.sourceUrl, DETAIL_MAX_RETRIES);
    if (!html) {
      failedCount++;
      consecutiveFailures++;

      // Treat repeated failures (e.g. 403s) as a soft block
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(
          `[craigslist-enrich] WARN: ${MAX_CONSECUTIVE_FAILURES} consecutive fetch failures — stopping enrichment to avoid ban. Enriched ${fetchedCount} listings so far.`,
        );
        blocked = true;
        break;
      }
      continue;
    }

    // Reset consecutive failure counter on success
    consecutiveFailures = 0;

    // Block detection — stop entire enrichment loop
    if (detectBlock(html)) {
      console.warn(
        `[craigslist-enrich] WARN: Detected block signal on detail page fetch — stopping enrichment to avoid ban. Enriched ${fetchedCount} listings so far.`,
      );
      blocked = true;
      break;
    }

    fetchedCount++;
    const detail = parseDetailPage(html);
    enrichedMap.set(listing.sourceUrl, detail);
  }

  // Build enriched listings array (preserves original order)
  const result: RawListing[] = [];

  for (const listing of listings) {
    const detail = enrichedMap.get(listing.sourceUrl);

    // No detail data available — return listing as-is
    if (!detail || !listing.sourceUrl || skippedUrls.has(listing.sourceUrl)) {
      result.push(listing);
      continue;
    }

    // Merge detail page data into listing (immutable — new object)
    let merged: RawListing = {
      ...listing,
      photoUrls: detail.photoUrls.length > 0 ? detail.photoUrls : listing.photoUrls,
      latitude: detail.latitude ?? listing.latitude,
      longitude: detail.longitude ?? listing.longitude,
      address: detail.address ?? listing.address,
      bathrooms: detail.bathrooms ?? listing.bathrooms,
      amenities: detail.amenities.length > 0 ? detail.amenities : listing.amenities,
      rawData: {
        ...listing.rawData,
        description: detail.description,
        postedDate: detail.postedDate,
      },
    };

    // LLM extraction for sparse listings (bedrooms/amenities still missing)
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

    result.push(merged);
  }

  console.log(
    `[craigslist-enrich] Enriched ${fetchedCount}/${listings.length} listings with detail page data (${failedCount} failed, ${llmCount} LLM extractions${blocked ? ', stopped early due to block' : ''})`,
  );

  if (!blocked && fetchedCount > 0 && failedCount / (fetchedCount + failedCount) > 0.5) {
    console.warn(
      `[craigslist-enrich] WARNING: ${Math.round((failedCount / (fetchedCount + failedCount)) * 100)}% of detail page fetches failed — Craigslist may be rate-limiting`,
    );
  }

  return result;
}
