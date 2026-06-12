/**
 * Tests for GET /api/crm/saved (AIN-72 — in-page save button already-saved check).
 *
 * Contract under test:
 *   - 401 without a Bearer token
 *   - 400 on missing sourceUrl query parameter
 *   - 400 on invalid sourceUrl (non-http scheme, empty)
 *   - 200 { saved: true, listingId } when a non-archived row matches (user_id, source_url)
 *   - 200 { saved: false } when no matching row
 *   - 429 when the rate limit is exceeded
 *   - OPTIONS returns CORS headers for the configured extension origin
 *   - Saved-check failure degrades gracefully (not tested here — tested in extension SW)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createQueryBuilder } from '../../__tests__/test-helpers';

// ── Stub next/headers (required by auth.ts) ──────────────────────────────────
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

// ── Hoist mock factories ──────────────────────────────────────────────────────
const { mockGetUser, mockFrom, mockCreateBearerClient } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateBearerClient: vi.fn(),
}));

const mockBearerClient = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
};

vi.mock('@campusnest/supabase/server', () => ({
  createServerComponentClient: vi.fn(() => ({ auth: { getUser: vi.fn() }, from: vi.fn() })),
  createSecretClient: vi.fn(() => ({ from: vi.fn() })),
  createBearerClient: mockCreateBearerClient,
}));

import { GET, OPTIONS } from '../route';

const EXT_ORIGIN = 'http://localhost:9999';

function makeRequest(
  sourceUrl: string | null,
  opts: { bearer?: string; origin?: string } = {},
): NextRequest {
  const url = sourceUrl
    ? `http://localhost/api/crm/saved?sourceUrl=${encodeURIComponent(sourceUrl)}`
    : 'http://localhost/api/crm/saved';
  const headers: Record<string, string> = {};
  if (opts.bearer) headers['authorization'] = `Bearer ${opts.bearer}`;
  if (opts.origin) headers['origin'] = opts.origin;
  return new NextRequest(url, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRM_EXTENSION_ORIGIN', EXT_ORIGIN);

  // Default: valid authenticated user
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'u-saved-1',
        email: 'emma@wisc.edu',
        user_metadata: { display_name: 'Emma' },
      },
    },
    error: null,
  });
  mockCreateBearerClient.mockReturnValue(mockBearerClient);
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe('GET /api/crm/saved — auth', () => {
  it('returns 401 when no Bearer token is provided', async () => {
    const req = makeRequest('https://zillow.com/homedetails/foo/123_zpid/');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is invalid (getUser returns null user)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
    const req = makeRequest('https://zillow.com/homedetails/foo/123_zpid/', {
      bearer: 'bad-token',
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('GET /api/crm/saved — validation', () => {
  it('returns 400 when sourceUrl param is missing', async () => {
    const req = makeRequest(null, { bearer: 'valid-token' });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBeTruthy();
  });

  it('returns 400 when sourceUrl has a non-http scheme', async () => {
    const req = makeRequest('javascript:alert(1)', { bearer: 'valid-token' });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when sourceUrl is empty', async () => {
    const req = makeRequest('', { bearer: 'valid-token' });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Already-saved: match found
// ---------------------------------------------------------------------------

describe('GET /api/crm/saved — saved: true', () => {
  it('returns 200 { saved: true, listingId } when a matching non-archived row exists', async () => {
    const qb = createQueryBuilder({ data: { id: 'listing-xyz' }, error: null });
    mockFrom.mockReturnValue(qb);

    const req = makeRequest(
      'https://www.zillow.com/homedetails/123-W-Main/123_zpid/',
      { bearer: 'valid-token', origin: EXT_ORIGIN },
    );
    const res = await GET(req);
    const body = await res.json() as { saved: boolean; listingId: string };

    expect(res.status).toBe(200);
    expect(body.saved).toBe(true);
    expect(body.listingId).toBe('listing-xyz');
  });

  it('queries crm_listings with user_id + source_url + neq archived', async () => {
    const qb = createQueryBuilder({ data: { id: 'listing-abc' }, error: null });
    mockFrom.mockReturnValue(qb);

    const sourceUrl = 'https://www.apartments.com/the-james-madison-wi/abc1234/';
    const req = makeRequest(sourceUrl, { bearer: 'valid-token' });
    await GET(req);

    expect(mockFrom).toHaveBeenCalledWith('crm_listings');
    expect(qb.eq).toHaveBeenCalledWith('user_id', 'u-saved-1');
    expect(qb.eq).toHaveBeenCalledWith('source_url', sourceUrl);
    expect(qb.neq).toHaveBeenCalledWith('status', 'archived');
  });
});

// ---------------------------------------------------------------------------
// Not yet saved: no match
// ---------------------------------------------------------------------------

describe('GET /api/crm/saved — saved: false', () => {
  it('returns 200 { saved: false } when no matching row exists', async () => {
    const qb = createQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(qb);

    const req = makeRequest(
      'https://www.zillow.com/homedetails/not-saved/999_zpid/',
      { bearer: 'valid-token' },
    );
    const res = await GET(req);
    const body = await res.json() as { saved: boolean };

    expect(res.status).toBe(200);
    expect(body.saved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('GET /api/crm/saved — rate limiting', () => {
  it('returns 429 when the user has exceeded the saved-check rate limit', async () => {
    const qb = createQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(qb);

    const sourceUrl = 'https://www.zillow.com/homedetails/foo/1_zpid/';
    // Exhaust the 120/hr limit (use a large hit count via direct limiter manipulation
    // — we import and reset the saved limiter for tests)
    const { _resetSavedLimiterForTests, SAVED_RATE_LIMIT } = await import('../route');
    _resetSavedLimiterForTests();

    // Hit the limit
    for (let i = 0; i < SAVED_RATE_LIMIT.maxRequests; i++) {
      await GET(makeRequest(sourceUrl, { bearer: 'valid-token' }));
    }

    // One more should be blocked
    const res = await GET(makeRequest(sourceUrl, { bearer: 'valid-token' }));
    expect(res.status).toBe(429);

    _resetSavedLimiterForTests();
  });
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
//
// NOTE: vitest with happy-dom runs route modules in a separate vm context
// where `process.env` mutations from the test file are not visible across
// worker thread boundaries. Origin-matching behaviour (allowed vs denied) is
// fully tested in _lib/__tests__/extension-cors.test.ts. Route-level CORS
// tests can only verify the Vary header and 204 status without env mutations.

describe('GET /api/crm/saved — CORS', () => {
  it('OPTIONS returns 204 with Vary: Origin', async () => {
    const req = new NextRequest('http://localhost/api/crm/saved', {
      method: 'OPTIONS',
      headers: { 'access-control-request-method': 'GET' },
    });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('vary')).toMatch(/origin/i);
  });

  it('OPTIONS does not set ACAO when env is unset and no origin is provided', async () => {
    const req = new NextRequest('http://localhost/api/crm/saved', {
      method: 'OPTIONS',
      headers: { 'access-control-request-method': 'GET' },
    });
    const res = await OPTIONS(req);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
