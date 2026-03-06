export interface WebSearchResult {
  readonly title: string;
  readonly url: string;
  readonly content: string;
  readonly score: number;
}

interface CacheEntry {
  readonly results: readonly WebSearchResult[];
  readonly timestamp: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const cache = new Map<string, CacheEntry>();

function normalizeKey(query: string): string {
  return query.toLowerCase().trim();
}

export function getCachedResults(query: string): readonly WebSearchResult[] | null {
  const key = normalizeKey(query);
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.results;
}

export function setCachedResults(query: string, results: readonly WebSearchResult[]): void {
  const key = normalizeKey(query);
  cache.set(key, { results, timestamp: Date.now() });
}

export function clearCache(): void {
  cache.clear();
}
