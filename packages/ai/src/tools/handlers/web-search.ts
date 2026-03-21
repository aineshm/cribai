import { z } from 'zod';
import { tavily } from '@tavily/core';
import type { ToolContext, ToolResult } from '../types';
import {
  getCachedResults,
  setCachedResults,
  type WebSearchResult,
} from '../../lib/web-search-cache';
import { synthesizeListingText } from '../../embeddings/synthesize-text';
import { generateEmbedding } from '../../embeddings/generate-embedding';

interface PersistWebListingParams {
  readonly address: string;
  readonly sourceUrl: string;
  readonly rentMonthly?: number;
  readonly bedrooms?: number;
  readonly content: string;
}

/**
 * Sanitize web content before injecting into model context.
 * Strips patterns that could be interpreted as instructions by the LLM.
 */
function sanitizeWebContent(content: string): string {
  return content
    // Remove common prompt injection patterns
    .replace(/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|rules?|prompts?)/gi, '[filtered]')
    .replace(/(?:you\s+are|act\s+as|pretend\s+to\s+be|from\s+now\s+on)/gi, '[filtered]')
    .replace(/(?:system\s*:?\s*|assistant\s*:?\s*|human\s*:?\s*)/gi, '')
    // Truncate to safe length
    .slice(0, 300);
}

/** Extracted structured data from web search result content */
interface ExtractedListingData {
  readonly prices: readonly number[];
  readonly bedrooms: readonly number[];
  readonly addresses: readonly string[];
}

/**
 * Extract structured listing data from web search result content.
 * Uses regex patterns to find prices, bedroom counts, and street addresses.
 */
function extractListingData(content: string): ExtractedListingData {
  // Extract prices: $800, $1,200, $1200/mo, etc.
  const priceMatches = content.match(/\$[\d,]+(?:\.\d{2})?(?:\s*\/\s*(?:mo|month|mth))?/gi) ?? [];
  const prices = priceMatches
    .map(p => parseInt(p.replace(/[$,\/\w\s.]/g, ''), 10))
    .filter(p => p >= 200 && p <= 10000); // Reasonable rent range

  // Extract bedroom counts: 1-bedroom, 2 bed, 3BR, studio
  const bedMatches = content.match(/(\d)\s*[-\s]?\s*(?:bed(?:room)?s?|br)\b/gi) ?? [];
  const bedrooms = bedMatches
    .map(b => parseInt(b, 10))
    .filter(b => b >= 0 && b <= 10);
  if (/\bstudio\b/i.test(content)) bedrooms.push(0);

  // Extract street addresses: patterns like "123 Main St" or "456 W Gorham St, Madison"
  const addressMatches = content.match(/\d+\s+(?:[NSEW]\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Ave|Blvd|Dr|Ln|Rd|Ct|Way|Pl|Cir|Pkwy)\.?(?:\s*(?:#|Unit|Apt|Suite)\s*\w+)?(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)?/g) ?? [];
  const addresses = [...new Set(addressMatches)].slice(0, 5);

  return { prices: [...new Set(prices)], bedrooms: [...new Set(bedrooms)], addresses };
}

/**
 * Returns true if the web search result has enough structured data to be
 * stored as a listing. Prevents garbage titles (e.g. "Top 10 apartments …")
 * from polluting the listings table.
 */
function hasMinimumListingFields(params: PersistWebListingParams): boolean {
  const address = params.address.trim();

  // Must have a non-empty address that looks like a real address
  // (contains at least one digit — street number)
  if (!address || !/\d/.test(address)) return false;

  // Must have a source URL
  if (!params.sourceUrl) return false;

  // Reject addresses that are clearly article titles (> 120 chars)
  if (address.length > 120) return false;

  return true;
}

/**
 * Persists a web search result as a listing in the database.
 */
export async function persistWebListing(
  params: PersistWebListingParams,
  context: ToolContext,
): Promise<string | null> {
  if (!hasMinimumListingFields(params)) {
    return null;
  }

  try {
    // Use address+URL as external_id to avoid collisions when one page has multiple addresses
    const externalId = `${params.sourceUrl}#${params.address}`;
    const { data, error } = await context.supabase
      .from('listings')
      .upsert(
        {
          external_id: externalId,
          address: params.address,
          source: 'web_search',
          source_url: params.sourceUrl,
          rent_monthly: params.rentMonthly ?? null,
          bedrooms: params.bedrooms ?? null,
          campus_id: context.campusId,
          is_active: true,
          raw_data: { web_content: params.content },
        },
        { onConflict: 'external_id,source' },
      )
      .select('id')
      .single();

    if (error) {
      console.error('persistWebListing upsert failed:', error.message);
      return null;
    }

    if (!data) {
      return null;
    }

    // Only generate embedding if listing doesn't already have one
    // (avoids redundant Gemini calls on cached/repeated web searches)
    const { data: existing } = await context.supabase
      .from('listings')
      .select('last_embedded_at')
      .eq('id', data.id)
      .single();

    if (!existing?.last_embedded_at) {
      try {
        const text = synthesizeListingText({
          address: params.address,
          rentMonthly: params.rentMonthly ?? null,
          bedrooms: params.bedrooms ?? null,
          bathrooms: null,
          sqft: null,
          amenities: [],
          photoCount: 0,
        });
        const embedding = await generateEmbedding(text);
        if (embedding) {
          const { error: embedError } = await context.supabase
            .from('listings')
            .update({
              embedding: `[${embedding.join(',')}]`,
              embedding_text: text,
              last_embedded_at: new Date().toISOString(),
            })
            .eq('id', data.id);

          if (embedError) {
            console.error(`persistWebListing embedding update failed for ${data.id}:`, embedError.message);
          }
        }
      } catch (err) {
        console.error(`persistWebListing embedding failed for ${data.id}:`, err);
      }
    }

    return data.id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('persistWebListing unexpected error:', message);
    return null;
  }
}

const inputSchema = z.object({
  query: z.string(),
  location: z.string().optional(),
});

export async function webSearch(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return {
      modelContext: 'Web search is not available. The TAVILY_API_KEY environment variable is not configured.',
      clientBlock: {
        type: 'text',
        content: 'Web search is currently unavailable. Please try again later.',
      },
    };
  }

  const location = parsed.location ?? 'Madison WI';
  const searchQuery = `${parsed.query} near ${location}`;

  // Check cache first
  const cached = getCachedResults(searchQuery);
  if (cached) {
    return buildEnrichedResult(cached, context);
  }

  try {
    const tvly = tavily({ apiKey });
    const response = await tvly.search(searchQuery, {
      maxResults: 8,
      searchDepth: 'advanced',
      topic: 'general',
    });

    const webResults: readonly WebSearchResult[] = (response.results ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      content: r.content ?? '',
      score: r.score ?? 0,
    }));

    if (webResults.length === 0) {
      return {
        modelContext: 'Web search returned no relevant results for this query.',
        clientBlock: {
          type: 'text',
          content: 'No relevant web results were found for your search.',
        },
      };
    }

    setCachedResults(searchQuery, webResults);

    return buildEnrichedResult(webResults, context);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      modelContext: `Web search failed: ${message}. The user can still browse listings in our database.`,
      clientBlock: {
        type: 'text',
        content: 'Web search encountered an error. You can still browse our listed properties.',
      },
    };
  }
}

/**
 * Build an enriched result by extracting structured listing data from each
 * web search result's content. Persists listings with real addresses and prices.
 */
async function buildEnrichedResult(
  results: readonly WebSearchResult[],
  context: ToolContext,
): Promise<ToolResult> {
  const enrichedEntries: string[] = [];
  const persistedIds: (string | null)[] = [];
  // Track the first persisted listing ID per result (for "View in CribAI" links)
  const resultListingIds: (string | null)[] = [];

  for (const r of results) {
    const extracted = extractListingData(r.content);

    // Persist each extracted address as a separate listing
    let firstIdForResult: string | null = null;
    if (extracted.addresses.length > 0) {
      for (const addr of extracted.addresses) {
        const id = await persistWebListing({
          address: addr,
          sourceUrl: r.url,
          rentMonthly: extracted.prices[0],
          bedrooms: extracted.bedrooms[0],
          content: r.content,
        }, context);
        if (id) {
          persistedIds.push(id);
          if (!firstIdForResult) firstIdForResult = id;
        }
      }
    }
    resultListingIds.push(firstIdForResult);

    // Build enriched model context entry
    const priceInfo = extracted.prices.length > 0
      ? `Prices mentioned: ${extracted.prices.map(p => `$${p.toLocaleString()}/mo`).join(', ')}`
      : 'No specific prices found';
    const bedInfo = extracted.bedrooms.length > 0
      ? `Bedrooms: ${extracted.bedrooms.map(b => b === 0 ? 'Studio' : `${b}BR`).join(', ')}`
      : '';
    const addrInfo = extracted.addresses.length > 0
      ? `Addresses found: ${extracted.addresses.join('; ')}`
      : 'No specific addresses extracted';

    enrichedEntries.push(
      `Source: ${r.title}\n` +
      `   URL: ${r.url}\n` +
      `   ${priceInfo}\n` +
      (bedInfo ? `   ${bedInfo}\n` : '') +
      `   ${addrInfo}\n` +
      `   Summary: ${sanitizeWebContent(r.content.slice(0, 300))}`
    );
  }

  const modelContext = `Web search found ${results.length} source(s) with extracted listing data:\n\n${enrichedEntries.join('\n\n')}\n\n` +
    `[IMPORTANT: Synthesize the extracted data above into a helpful response. ` +
    `Mention specific prices, addresses, and bedroom counts when available. ` +
    `If a result is just an aggregator homepage (apartments.com, zillow.com), ` +
    `summarize what it indicates about the market rather than just linking to it. ` +
    `Recommend the user check specific properties you found addresses for.]`;

  return {
    modelContext,
    clientBlock: {
      type: 'web_result' as const,
      results: results.map((r, i) => ({
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, 200),
        listingId: resultListingIds[i] ?? null,
      })),
    },
  };
}
