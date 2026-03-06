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
 * Web results are ephemeral in chat. They become persistent listings only when
 * a user saves them to favorites, at which point persistWebListing creates the
 * listing record and the Phase 3 embedding pipeline will embed it on the next run.
 */
export async function persistWebListing(
  params: PersistWebListingParams,
  context: ToolContext,
): Promise<string | null> {
  try {
    const { data, error } = await context.supabase
      .from('listings')
      .upsert(
        {
          address: params.address,
          source: 'web_search',
          source_url: params.sourceUrl,
          rent_monthly: params.rentMonthly ?? null,
          bedrooms: params.bedrooms ?? null,
          campus_id: context.campusId,
          is_active: true,
          raw_data: { web_content: params.content },
        },
        { onConflict: 'source,source_url' },
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

    // Trigger embedding pipeline by clearing last_embedded_at
    await context.supabase
      .from('listings')
      .update({ last_embedded_at: null })
      .eq('id', data.id);

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
  _context: ToolContext,
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

  // Check cache first
  const cached = getCachedResults(searchQuery);
  if (cached) {
    return buildResult(cached);
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
    return buildResult(webResults);
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

function buildResult(results: readonly WebSearchResult[]): ToolResult {
  const modelContext = `Found ${results.length} web result(s):\n${results
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content.slice(0, 200)}`,
    )
    .join('\n')}`;

  const clientContent = `Found ${results.length} result(s) from the web:\n${results
    .map((r, i) => `${i + 1}. **${r.title}** - ${r.url}`)
    .join('\n')}`;

  return {
    modelContext,
    clientBlock: {
      type: 'text',
      content: clientContent,
    },
  };
}
