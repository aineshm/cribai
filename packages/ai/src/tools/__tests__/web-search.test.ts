import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockContext } from './helpers';
import { clearCache, setCachedResults } from '../../lib/web-search-cache';

// Mock @tavily/core
const mockSearch = vi.fn();
vi.mock('@tavily/core', () => ({
  tavily: vi.fn(() => ({ search: mockSearch })),
}));

// Must import after mock setup
import { webSearch } from '../handlers/web-search';

describe('webSearch handler', () => {
  const originalEnv = process.env.TAVILY_API_KEY;

  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
    mockSearch.mockReset();
    process.env.TAVILY_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.TAVILY_API_KEY = originalEnv;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  });

  it('returns graceful message when TAVILY_API_KEY is missing', async () => {
    delete process.env.TAVILY_API_KEY;

    const result = await webSearch({ query: 'apartments' }, createMockContext());

    expect(result.modelContext).toContain('Web search is not available');
    expect(result.clientBlock.type).toBe('text');
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('calls Tavily and returns structured results', async () => {
    mockSearch.mockResolvedValue({
      results: [
        { title: 'Nice Apt', url: 'https://example.com/1', content: 'A great apartment near campus', score: 0.95 },
        { title: 'Budget Place', url: 'https://example.com/2', content: 'Affordable housing option', score: 0.85 },
      ],
    });

    const result = await webSearch(
      { query: '2 bedroom near UW Madison' },
      createMockContext(),
    );

    expect(result.modelContext).toContain('Found 2 web result(s)');
    expect(result.modelContext).toContain('Nice Apt');
    expect(result.modelContext).toContain('https://example.com/1');
    expect(result.clientBlock.type).toBe('web_result');
    const block = result.clientBlock as { type: 'web_result'; results: Array<{ title: string; url: string; snippet: string; listingId: string | null }> };
    expect(block.results).toHaveLength(2);
    const first = block.results[0]!;
    expect(first.title).toBe('Nice Apt');
    expect(first.url).toBe('https://example.com/1');
    expect(first.snippet).toBeTruthy();
    expect(first.listingId).toBeNull(); // persist fails gracefully with mock context
  });

  it('returns cached results without calling Tavily', async () => {
    const cached = [
      { title: 'Cached Apt', url: 'https://cached.com/1', content: 'Cached result', score: 0.9 },
    ];
    // Build the same searchQuery the handler builds
    setCachedResults('test query apartments rentals near Madison WI', cached);

    const result = await webSearch({ query: 'test query' }, createMockContext());

    expect(result.modelContext).toContain('Found 1 web result(s)');
    expect(result.modelContext).toContain('Cached Apt');
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('returns graceful message when Tavily returns 0 results', async () => {
    mockSearch.mockResolvedValue({ results: [] });

    const result = await webSearch({ query: 'impossible search' }, createMockContext());

    expect(result.modelContext).toContain('no relevant results');
    expect(result.clientBlock.type).toBe('text');
  });

  it('returns graceful failure when Tavily throws', async () => {
    mockSearch.mockRejectedValue(new Error('Rate limit exceeded'));

    const result = await webSearch({ query: 'apartments' }, createMockContext());

    expect(result.modelContext).toContain('Web search failed');
    expect(result.modelContext).toContain('Rate limit exceeded');
    expect(result.clientBlock.type).toBe('text');
  });

  it('uses provided location in search query', async () => {
    mockSearch.mockResolvedValue({
      results: [
        { title: 'Chicago Apt', url: 'https://example.com/chi', content: 'Chicago area', score: 0.9 },
      ],
    });

    await webSearch(
      { query: 'apartments', location: 'Chicago IL' },
      createMockContext(),
    );

    expect(mockSearch).toHaveBeenCalledWith(
      'apartments apartments rentals near Chicago IL',
      expect.objectContaining({ maxResults: 8 }),
    );
  });
});
