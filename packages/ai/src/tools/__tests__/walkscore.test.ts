import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getWalkScore } from '../lib/walkscore';

describe('walkscore', () => {
  const mockFetch = vi.fn();
  const API_KEY = 'test-walkscore-key';

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns walk/transit/bike scores for a valid address', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        walkscore: 78,
        description: 'Very Walkable',
        transit: { score: 52, description: 'Good Transit' },
        bike: { score: 65, description: 'Bikeable' },
      }),
    });

    const result = await getWalkScore('123 Main St, Madison, WI', 43.07, -89.4, API_KEY);

    expect(result).toEqual({
      walkscore: 78,
      description: 'Very Walkable',
      transit: { score: 52, description: 'Good Transit' },
      bike: { score: 65, description: 'Bikeable' },
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('api.walkscore.com/score');
    expect(calledUrl).toContain('format=json');
    expect(calledUrl).toContain('transit=1');
    expect(calledUrl).toContain('bike=1');
    expect(calledUrl).toContain(`wsapikey=${API_KEY}`);
  });

  it('returns null scores when API returns status != 1', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 2,
        description: 'Score not available',
      }),
    });

    const result = await getWalkScore('Remote Address', 43.07, -89.4, API_KEY);

    expect(result).toEqual({
      walkscore: null,
      description: 'Score not available',
      transit: null,
      bike: null,
    });
  });

  it('handles network errors gracefully (returns null-score result)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await getWalkScore('123 Main St', 43.07, -89.4, API_KEY);

    expect(result).toEqual({
      walkscore: null,
      description: 'Score unavailable',
      transit: null,
      bike: null,
    });
  });
});
