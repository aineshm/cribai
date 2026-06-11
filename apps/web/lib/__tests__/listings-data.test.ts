import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * AIN-63 — explore demoted to sublease-only inventory.
 *
 * Display read paths (explore grid, featured grid, viewport/map) must filter
 * to source='sublease'. The by-id path stays unfiltered so old links and
 * conversations referencing scraped listings never 404.
 */

interface BuilderCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

interface QueryResult {
  readonly data: unknown;
  readonly error: unknown;
}

function createQueryBuilder(result: QueryResult = { data: [], error: null }) {
  const calls: BuilderCall[] = [];
  const builder: Record<string, unknown> = {};
  const chainMethods = ['select', 'eq', 'neq', 'gte', 'lte', 'not', 'order', 'range', 'limit'] as const;

  for (const method of chainMethods) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  // Make the builder awaitable (queries resolve when awaited at any chain depth)
  builder.then = (resolve: (value: QueryResult) => void) => resolve(result);

  return { builder, calls };
}

function hasSourceSubleaseFilter(calls: readonly BuilderCall[]): boolean {
  return calls.some(
    (call) => call.method === 'eq' && call.args[0] === 'source' && call.args[1] === 'sublease',
  );
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@campusnest/supabase/server', () => ({
  createSecretClient: vi.fn(() => ({ from: fromMock })),
}));

import {
  fetchExploreListings,
  fetchFeaturedExploreListings,
  fetchViewportExploreListings,
  fetchListingById,
} from '../listings-data';

const BOUNDS = { minLat: 43.0, maxLat: 43.2, minLng: -89.5, maxLng: -89.3 };

/** A scraped (non-sublease) row — must stay reachable by id */
const SCRAPED_ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  address: '123 W Main St, Madison, WI',
  rent_monthly: 1200,
  bedrooms: 2,
  bathrooms: 1,
  sqft: 800,
  amenities: null,
  photo_urls: null,
  source: 'zillow',
  source_url: 'https://zillow.com/homedetails/x',
  fairness_score: 7,
  available_date: null,
  description: 'Spacious two bedroom near campus.',
  raw_data: null,
  location: null,
  latitude: 43.07,
  longitude: -89.4,
  creator_id: null,
  contact_email: null,
  true_cost_total: null,
  fairness_data: null,
};

describe('listings-data — sublease-only discovery (AIN-63)', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('fetchExploreListings filters to source=sublease', async () => {
    const { builder, calls } = createQueryBuilder();
    fromMock.mockReturnValue(builder);

    await fetchExploreListings();

    expect(fromMock).toHaveBeenCalledWith('listings');
    expect(hasSourceSubleaseFilter(calls)).toBe(true);
  });

  it('fetchFeaturedExploreListings filters to source=sublease', async () => {
    const { builder, calls } = createQueryBuilder();
    fromMock.mockReturnValue(builder);

    await fetchFeaturedExploreListings(12);

    expect(fromMock).toHaveBeenCalledWith('listings');
    expect(hasSourceSubleaseFilter(calls)).toBe(true);
  });

  it('fetchViewportExploreListings filters to source=sublease', async () => {
    const { builder, calls } = createQueryBuilder();
    fromMock.mockReturnValue(builder);

    await fetchViewportExploreListings({ bounds: BOUNDS, limit: 100 });

    expect(fromMock).toHaveBeenCalledWith('listings');
    expect(hasSourceSubleaseFilter(calls)).toBe(true);
  });

  it('fetchListingById stays unfiltered — scraped listings remain reachable by id', async () => {
    const { builder, calls } = createQueryBuilder({ data: SCRAPED_ROW, error: null });
    fromMock.mockReturnValue(builder);

    const detail = await fetchListingById(SCRAPED_ROW.id);

    expect(hasSourceSubleaseFilter(calls)).toBe(false);
    expect(detail).not.toBeNull();
    expect(detail?.source).toBe('zillow');
  });
});
