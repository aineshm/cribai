import { z } from 'zod';
import { tavily } from '@tavily/core';
import type { ToolContext, ToolResult } from '../types';
import {
  getCachedResults,
  setCachedResults,
  type WebSearchResult,
} from '../../lib/web-search-cache';

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
