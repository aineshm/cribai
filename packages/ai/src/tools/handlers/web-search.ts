import { z } from 'zod';
import { tavily } from '@tavily/core';
import type { ToolContext, ToolResult } from '../types';
import {
  getCachedResults,
  setCachedResults,
  type WebSearchResult,
} from '../../lib/web-search-cache';

interface PersistWebListingParams {
  readonly address: string;
  readonly sourceUrl: string;
  readonly rentMonthly?: number;
  readonly bedrooms?: number;
  readonly content: string;
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
 * Persists a web search result as a listing in the database. Called for every
 * web search result returned by webSearch(). Uses upsert on (source, source_url)
 * so duplicate URLs are deduplicated. The Phase 3 embedding pipeline will embed
 * new/changed rows on the next nightly run.
 *
 * Returns null without persisting if the result lacks minimum required fields
 * (parseable address, source URL). Results are still returned to the AI as
 * search context even when not persisted.
 */
export async function persistWebListing(
  params: PersistWebListingParams,
  context: ToolContext,
): Promise<string | null> {
  if (!hasMinimumListingFields(params)) {
    return null;
  }

  try {
    const { data, error } = await context.supabase
      .from('listings')
      .upsert(
        {
          external_id: params.sourceUrl,
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

    // Reset last_embedded_at so the embedding pipeline re-processes this listing
    const { error: updateError } = await context.supabase
      .from('listings')
      .update({ last_embedded_at: null })
      .eq('id', data.id);

    if (updateError) {
      console.error('persistWebListing embedding reset failed:', updateError.message);
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
  const searchQuery = `${parsed.query} apartments rentals near ${location}`;

  // Check cache first — still resolve persisted IDs so model context has them
  const cached = getCachedResults(searchQuery);
  if (cached) {
    const cachedIds = await Promise.all(
      cached.map(r => persistWebListing({
        address: r.title,
        sourceUrl: r.url,
        content: r.content,
      }, context))
    );
    return buildResult(cached, cachedIds);
  }

  try {
    const tvly = tavily({ apiKey });
    const response = await tvly.search(searchQuery, {
      maxResults: 8,
      searchDepth: 'basic',
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

    const persistedIds = await Promise.all(
      webResults.map(r => persistWebListing({
        address: r.title,
        sourceUrl: r.url,
        content: r.content,
      }, context))
    );

    return buildResult(webResults, persistedIds);
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

function buildResult(
  results: readonly WebSearchResult[],
  persistedIds: readonly (string | null)[] = [],
): ToolResult {
  const modelContext = `Found ${results.length} web result(s):\n${results
    .map(
      (r, i) => {
        const id = persistedIds[i];
        const idSuffix = id ? `\n   Listing ID: ${id}` : '';
        return `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content.slice(0, 200)}${idSuffix}`;
      },
    )
    .join('\n')}`;

  return {
    modelContext,
    clientBlock: {
      type: 'web_result' as const,
      results: results.map((r, i) => ({
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, 200),
        listingId: persistedIds[i] ?? null,
      })),
    },
  };
}
