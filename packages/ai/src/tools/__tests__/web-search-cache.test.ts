import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getCachedResults, setCachedResults, clearCache } from '../../lib/web-search-cache';

describe('web-search-cache', () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const sampleResults = [
    { title: 'Apt 1', url: 'https://example.com/1', content: 'Nice apartment', score: 0.9 },
    { title: 'Apt 2', url: 'https://example.com/2', content: 'Another apartment', score: 0.8 },
  ] as const;

  it('returns null for never-searched query', () => {
    expect(getCachedResults('some query')).toBeNull();
  });

  it('returns cached results for recently searched query', () => {
    setCachedResults('test query', [...sampleResults]);
    const result = getCachedResults('test query');
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result![0]!.title).toBe('Apt 1');
  });

  it('normalizes query to lowercase trimmed before storing', () => {
    setCachedResults('  Test QUERY  ', [...sampleResults]);
    const result = getCachedResults('test query');
    expect(result).toHaveLength(2);
  });

  it('returns null for expired cache entries (>30 min)', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    setCachedResults('test query', [...sampleResults]);

    // Advance 31 minutes
    vi.setSystemTime(now + 31 * 60 * 1000);

    expect(getCachedResults('test query')).toBeNull();
  });

  it('returns results within 30 min TTL window', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    setCachedResults('test query', [...sampleResults]);

    // Advance 29 minutes
    vi.setSystemTime(now + 29 * 60 * 1000);

    expect(getCachedResults('test query')).toHaveLength(2);
  });

  it('clearCache empties all entries', () => {
    setCachedResults('query1', [...sampleResults]);
    setCachedResults('query2', [...sampleResults]);

    clearCache();

    expect(getCachedResults('query1')).toBeNull();
    expect(getCachedResults('query2')).toBeNull();
  });
});
