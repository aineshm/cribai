/**
 * Tests for POST /api/crm/rank (AIN-61) — rankCompare core (deterministic, no LLM).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

const { mockGetUser, mockRankCompare } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRankCompare: vi.fn(),
}));

const mockRlsClient = { auth: { getUser: mockGetUser }, from: vi.fn() };

vi.mock('@campusnest/supabase/server', () => ({
  createServerComponentClient: vi.fn(() => mockRlsClient),
  createSecretClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock('@campusnest/ai', () => ({
  rankCompare: mockRankCompare,
}));

import { POST } from '../route';

const USER = { id: 'u-1', email: 'emma@wisc.edu' };
const LISTING_ID = 'b7e8f3a0-1111-4222-8333-444455556666';

function rankRequest(body: unknown) {
  const request = new NextRequest('http://localhost/api/crm/rank', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return POST(request);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: USER }, error: null });
});

describe('POST /api/crm/rank', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await rankRequest({ mode: 'rank' });
    expect(res.status).toBe(401);
    expect(mockRankCompare).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON', async () => {
    const res = await rankRequest('{nope');
    expect(res.status).toBe(400);
  });

  it('returns 400 on an unknown mode', async () => {
    const res = await rankRequest({ mode: 'sort' });
    expect(res.status).toBe(400);
    expect(mockRankCompare).not.toHaveBeenCalled();
  });

  it('returns 400 when listingIds contains a non-UUID', async () => {
    const res = await rankRequest({ mode: 'compare', listingIds: ['nope'] });
    expect(res.status).toBe(400);
    expect(mockRankCompare).not.toHaveBeenCalled();
  });

  it('calls rankCompare with the mode + user-scoped deps and returns the result', async () => {
    const result = { mode: 'rank', ranked: [] };
    mockRankCompare.mockResolvedValue(result);

    const res = await rankRequest({ mode: 'rank' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);

    const [args, deps] = mockRankCompare.mock.calls[0]!;
    expect(args).toEqual({ mode: 'rank', listingIds: undefined });
    expect(deps.userId).toBe('u-1');
    expect(deps.db).toBe(mockRlsClient);
  });

  it('passes listingIds through in compare mode', async () => {
    const result = { mode: 'compare', rows: [] };
    mockRankCompare.mockResolvedValue(result);

    const res = await rankRequest({ mode: 'compare', listingIds: [LISTING_ID] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);

    const [args] = mockRankCompare.mock.calls[0]!;
    expect(args).toEqual({ mode: 'compare', listingIds: [LISTING_ID] });
  });

  it('returns a generic 500 when the core throws', async () => {
    mockRankCompare.mockRejectedValue(new Error('db detail'));
    const res = await rankRequest({ mode: 'rank' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toMatch(/db detail/);
  });
});
