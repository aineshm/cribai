/**
 * Tests for /api/crm/listings (AIN-61):
 *   GET  — user's non-archived crm_listings, saved_at desc, RLS-scoped.
 *   POST — { sourceUrl } → addListing core → AddListingResult.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createQueryBuilder } from '../../__tests__/test-helpers';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

const { mockGetUser, mockFrom, mockSecretFrom, mockAddListing, mockExtract, mockGeocode, mockAfterFn } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockFrom: vi.fn(),
    mockSecretFrom: vi.fn(),
    mockAddListing: vi.fn(),
    mockExtract: vi.fn(),
    mockGeocode: vi.fn(),
    mockAfterFn: vi.fn(),
  }));

// ── Mock next/server to capture `after` calls without replacing NextRequest/NextResponse ──
vi.mock('next/server', async (importActual) => {
  const actual = await importActual<typeof import('next/server')>();
  return { ...actual, after: mockAfterFn };
});

const mockRlsClient = { auth: { getUser: mockGetUser }, from: mockFrom };
const mockSecretClient = { from: mockSecretFrom };

vi.mock('@campusnest/supabase/server', () => ({
  createServerComponentClient: vi.fn(() => mockRlsClient),
  createSecretClient: vi.fn(() => mockSecretClient),
}));

vi.mock('@campusnest/ai', () => {
  class AddListingError extends Error {
    readonly code: string;
    readonly userMessage: string;
    constructor(code: string, userMessage: string) {
      super(userMessage);
      this.name = 'AddListingError';
      this.code = code;
      this.userMessage = userMessage;
    }
  }
  return {
    addListing: mockAddListing,
    AddListingError,
    extractListing: mockExtract,
    geocodeAddress: mockGeocode,
    // CodeRabbit PR #121 fix 4b: the route now imports the shared alias
    // constant instead of a hardcoded literal — the mock must supply it.
    DEEP_EXTRACT_ALIAS: 'deep_extract:raw_extraction->deep_extract',
  };
});

import { AddListingError } from '@campusnest/ai';
import { GET, POST } from '../route';

const USER = { id: 'u-1', email: 'emma@wisc.edu', user_metadata: { display_name: 'Emma' } };

const ROW = {
  id: 'b7e8f3a0-1111-4222-8333-444455556666',
  user_id: 'u-1',
  source_url: 'https://www.zillow.com/x',
  source_site: 'zillow',
  title: 'Test Apt',
  address: '1 Main St',
  rent: 1200,
  bedrooms: 2,
  bathrooms: 1,
  sqft: 800,
  available_from: '2026-08-15',
  description: 'desc',
  amenities: ['Dishwasher'],
  photo_urls: [],
  extraction_confidence: 0.9,
  status: 'active',
  user_notes: null,
  saved_at: '2026-06-01T00:00:00Z',
};

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/crm/listings', { method: 'GET' });
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/crm/listings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: USER }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/crm/listings', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns the user-scoped, non-archived rows ordered by saved_at desc', async () => {
    const builder = createQueryBuilder({ data: [ROW], error: null });
    mockFrom.mockReturnValue(builder);

    const res = await GET(getRequest());
    expect(res.status).toBe(200);

    // RLS-proxy assertions: scoped to the authed user, archived excluded.
    expect(mockFrom).toHaveBeenCalledWith('crm_listings');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(builder.neq).toHaveBeenCalledWith('status', 'archived');
    expect(builder.order).toHaveBeenCalledWith('saved_at', { ascending: false });

    const body = await res.json();
    expect(body.listings).toEqual([ROW]);
    expect(body.viewer).toEqual({ id: 'u-1', name: 'Emma' });
  });

  // AIN-83: expose ONLY the deep_extract subtree (floor_plans / price_is_from),
  // via a PostgREST JSON-path alias — never raw_extraction wholesale (multi-KB
  // JSON-LD/OG blobs the browser never needs).
  it('selects the deep_extract JSON-path alias, not raw_extraction wholesale', async () => {
    const builder = createQueryBuilder({ data: [ROW], error: null });
    mockFrom.mockReturnValue(builder);

    await GET(getRequest());

    const selectArg = builder.select.mock.calls[0]![0] as string;
    expect(selectArg).toContain('deep_extract:raw_extraction->deep_extract');
    expect(selectArg).not.toContain('raw_extraction,');
    expect(selectArg.trim()).not.toMatch(/(^|,\s*)raw_extraction(\s*,|$)/);
  });

  it('uses the RLS-bound client (not the service-role client) in production auth mode', async () => {
    mockFrom.mockReturnValue(createQueryBuilder({ data: [], error: null }));
    await GET(getRequest());
    expect(mockFrom).toHaveBeenCalled();
    expect(mockSecretFrom).not.toHaveBeenCalled();
  });

  it('uses the service-role client + default dev user in dev-bypass mode', async () => {
    vi.stubEnv('BYPASS_AUTH', 'true');
    const builder = createQueryBuilder({ data: [], error: null });
    mockSecretFrom.mockReturnValue(builder);

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    expect(mockSecretFrom).toHaveBeenCalledWith('crm_listings');
    expect(mockFrom).not.toHaveBeenCalled();
    // Still scoped to the dev user id even on the RLS-bypassing client.
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'a0000000-0000-4000-8000-000000000001');
  });

  it('returns 500 with a generic message on a db error', async () => {
    mockFrom.mockReturnValue(createQueryBuilder({ data: null, error: { message: 'boom' } }));
    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toMatch(/boom/);
  });
});

describe('POST /api/crm/listings', () => {
  const SOURCE_URL = 'https://www.zillow.com/homedetails/123';

  // The per-user row-cap check queries crm_listings before the save; default
  // every POST test to an under-cap count.
  beforeEach(() => {
    mockFrom.mockReturnValue(createQueryBuilder({ data: null, error: null, count: 0 }));
    mockSecretFrom.mockReturnValue(createQueryBuilder({ data: null, error: null, count: 0 }));
  });

  it('returns 429 when the user is at the saved-listings cap (no extraction work)', async () => {
    const builder = createQueryBuilder({ data: null, error: null, count: 200 });
    mockFrom.mockReturnValue(builder);

    const res = await POST(postRequest({ sourceUrl: SOURCE_URL }));

    expect(res.status).toBe(429);
    expect(mockAddListing).not.toHaveBeenCalled();
    // Cap query is user-scoped and excludes archived (archiving frees slots).
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(builder.neq).toHaveBeenCalledWith('status', 'archived');
  });

  it('returns 500 when the cap check itself fails (no extraction work)', async () => {
    mockFrom.mockReturnValue(createQueryBuilder({ data: null, error: { message: 'boom' }, count: null }));
    const res = await POST(postRequest({ sourceUrl: SOURCE_URL }));
    expect(res.status).toBe(500);
    expect(mockAddListing).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(postRequest({ sourceUrl: SOURCE_URL }));
    expect(res.status).toBe(401);
    expect(mockAddListing).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON', async () => {
    const res = await POST(postRequest('{nope'));
    expect(res.status).toBe(400);
    expect(mockAddListing).not.toHaveBeenCalled();
  });

  it('returns 400 on a non-URL sourceUrl', async () => {
    const res = await POST(postRequest({ sourceUrl: 'not a url' }));
    expect(res.status).toBe(400);
    expect(mockAddListing).not.toHaveBeenCalled();
  });

  it('returns 400 on a non-http(s) scheme', async () => {
    const res = await POST(postRequest({ sourceUrl: 'ftp://example.com/listing' }));
    expect(res.status).toBe(400);
    expect(mockAddListing).not.toHaveBeenCalled();
  });

  it('calls the addListing core with extract/geocode deps + the user-scoped db and returns 201', async () => {
    const result = { listingId: ROW.id, alreadySaved: false, confidence: 0.9 };
    mockAddListing.mockResolvedValue(result);

    const res = await POST(postRequest({ sourceUrl: SOURCE_URL }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(result);

    expect(mockAddListing).toHaveBeenCalledTimes(1);
    const [url, deps] = mockAddListing.mock.calls[0]!;
    expect(url).toBe(SOURCE_URL);
    expect(deps.userId).toBe('u-1');
    expect(deps.db).toBe(mockRlsClient);
    expect(deps.extract).toBe(mockExtract);
    expect(deps.geocode).toBe(mockGeocode);
  });

  it('passes a scheduleBackground dep that wraps after() (AIN-95 nickname generation)', async () => {
    mockAddListing.mockResolvedValue({ listingId: ROW.id, alreadySaved: false, confidence: 0.9 });
    mockAfterFn.mockClear();

    await POST(postRequest({ sourceUrl: SOURCE_URL }));

    const [, deps] = mockAddListing.mock.calls[0]!;
    expect(typeof deps.scheduleBackground).toBe('function');

    // Invoking scheduleBackground with a task must hand it to after(), not
    // execute it directly.
    const task = vi.fn().mockResolvedValue(undefined);
    deps.scheduleBackground(task);
    expect(mockAfterFn).toHaveBeenCalledWith(task);
    expect(task).not.toHaveBeenCalled();
  });

  it('returns 200 (not 201) when the listing was already saved', async () => {
    mockAddListing.mockResolvedValue({ listingId: ROW.id, alreadySaved: true, confidence: 0.9 });
    const res = await POST(postRequest({ sourceUrl: SOURCE_URL }));
    expect(res.status).toBe(200);
  });

  it.each([
    ['parse_failed', 422],
    ['no_listing_data', 422],
    ['fetch_blocked', 502],
    ['fetch_failed', 502],
    ['db_error', 500],
  ] as const)('maps AddListingError %s → %d with the user message', async (code, status) => {
    mockAddListing.mockRejectedValue(new AddListingError(code, 'User-facing message.'));
    const res = await POST(postRequest({ sourceUrl: SOURCE_URL }));
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.error).toBe('User-facing message.');
    expect(body.code).toBe(code);
  });

  it('returns a generic 500 on an unexpected throw (no internals leaked)', async () => {
    mockAddListing.mockRejectedValue(new Error('secret internal detail'));
    const res = await POST(postRequest({ sourceUrl: SOURCE_URL }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toMatch(/secret internal detail/);
  });
});
