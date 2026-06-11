/**
 * Tests for GET /api/crm/listings/[id]/analysis (AIN-61).
 *
 * Returns the persisted `analysis` column when present; otherwise runs the
 * firstSaveAnalysis core, write-throughs the result (migration 039 columns),
 * and returns it. Transient failures (any `error` branch) are NOT persisted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createQueryBuilder } from '../../../../__tests__/test-helpers';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

const { mockGetUser, mockFrom, mockFirstSaveAnalysis } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockFirstSaveAnalysis: vi.fn(),
}));

const mockRlsClient = { auth: { getUser: mockGetUser }, from: mockFrom };

vi.mock('@campusnest/supabase/server', () => ({
  createServerComponentClient: vi.fn(() => mockRlsClient),
  createSecretClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock('@campusnest/ai', () => ({
  firstSaveAnalysis: mockFirstSaveAnalysis,
}));

import { GET } from '../route';

const USER = { id: 'u-1', email: 'emma@wisc.edu' };
const LISTING_ID = 'b7e8f3a0-1111-4222-8333-444455556666';

const CLEAN_ANALYSIS = {
  listingId: LISTING_ID,
  trueCost: { status: 'ok', data: { rent: 1200, total: 1300 } },
  redFlags: { status: 'ok', data: { flags: [], summary: 'Clean.' } },
  placesSnapshot: { status: 'skipped', reason: 'no coordinates' },
  steeringQuestion: { status: 'ok', data: { question: 'q?' } },
};

const ERRORED_ANALYSIS = {
  ...CLEAN_ANALYSIS,
  redFlags: { status: 'error', error: 'timeout' },
};

function getAnalysis(id: string) {
  const request = new NextRequest(`http://localhost/api/crm/listings/${id}/analysis`, {
    method: 'GET',
  });
  return GET(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: USER }, error: null });
});

describe('GET /api/crm/listings/[id]/analysis', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await getAnalysis(LISTING_ID);
    expect(res.status).toBe(401);
    expect(mockFirstSaveAnalysis).not.toHaveBeenCalled();
  });

  it('returns 400 on a non-UUID id', async () => {
    const res = await getAnalysis('nope');
    expect(res.status).toBe(400);
  });

  it('returns 404 when the listing is missing or not owned by the user', async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const res = await getAnalysis(LISTING_ID);
    expect(res.status).toBe(404);
    // RLS-proxy assertion: the ownership filter is always applied.
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(mockFirstSaveAnalysis).not.toHaveBeenCalled();
  });

  it('returns the persisted analysis without re-running the core', async () => {
    mockFrom.mockReturnValue(
      createQueryBuilder({ data: { id: LISTING_ID, analysis: CLEAN_ANALYSIS }, error: null }),
    );

    const res = await getAnalysis(LISTING_ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(CLEAN_ANALYSIS);
    expect(mockFirstSaveAnalysis).not.toHaveBeenCalled();
    // Only the read — no write-through update.
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('runs the core, persists write-through, and returns the analysis when none is stored', async () => {
    const selectBuilder = createQueryBuilder({
      data: { id: LISTING_ID, analysis: null },
      error: null,
    });
    const updateBuilder = createQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValueOnce(selectBuilder).mockReturnValueOnce(updateBuilder);
    mockFirstSaveAnalysis.mockResolvedValue(CLEAN_ANALYSIS);

    const res = await getAnalysis(LISTING_ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(CLEAN_ANALYSIS);

    expect(mockFirstSaveAnalysis).toHaveBeenCalledTimes(1);
    const [calledId, deps] = mockFirstSaveAnalysis.mock.calls[0]!;
    expect(calledId).toBe(LISTING_ID);
    expect(deps.userId).toBe('u-1');
    expect(deps.db).toBe(mockRlsClient);

    // Write-through into migration 039 columns, ownership-scoped.
    expect(updateBuilder.update).toHaveBeenCalledWith({
      analysis: CLEAN_ANALYSIS,
      analyzed_at: expect.any(String),
    });
    expect(updateBuilder.eq).toHaveBeenCalledWith('id', LISTING_ID);
    expect(updateBuilder.eq).toHaveBeenCalledWith('user_id', 'u-1');
  });

  it('does NOT persist an analysis containing an error branch (transient failure)', async () => {
    const selectBuilder = createQueryBuilder({
      data: { id: LISTING_ID, analysis: null },
      error: null,
    });
    mockFrom.mockReturnValue(selectBuilder);
    mockFirstSaveAnalysis.mockResolvedValue(ERRORED_ANALYSIS);

    const res = await getAnalysis(LISTING_ID);
    expect(res.status).toBe(200);
    // Error branches are sanitized to the stable code before serialization —
    // raw exception text never reaches the browser (security M1, AIN-61).
    expect(await res.json()).toEqual({
      ...ERRORED_ANALYSIS,
      redFlags: { status: 'error', error: 'analysis_failed' },
    });
    // Only the initial read hit the db — no update call.
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(selectBuilder.update).not.toHaveBeenCalled();
  });

  it('never serializes raw provider error strings in a fresh error-branch analysis', async () => {
    const rawError = 'AI_APICallError: 403 https://api.openai.com/v1 (request id req-9)';
    const selectBuilder = createQueryBuilder({
      data: { id: LISTING_ID, analysis: null },
      error: null,
    });
    mockFrom.mockReturnValue(selectBuilder);
    mockFirstSaveAnalysis.mockResolvedValue({
      ...ERRORED_ANALYSIS,
      redFlags: { status: 'error', error: rawError },
    });

    const res = await getAnalysis(LISTING_ID);
    const body = JSON.stringify(await res.json());
    expect(body).toContain('analysis_failed');
    expect(body).not.toContain('req-9');
    expect(body).not.toContain('api.openai.com');
  });

  it('still returns the analysis when the write-through update fails', async () => {
    const selectBuilder = createQueryBuilder({
      data: { id: LISTING_ID, analysis: null },
      error: null,
    });
    const updateBuilder = createQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValueOnce(selectBuilder).mockReturnValueOnce(updateBuilder);
    mockFirstSaveAnalysis.mockResolvedValue(CLEAN_ANALYSIS);

    const res = await getAnalysis(LISTING_ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(CLEAN_ANALYSIS);
  });

  it('maps a core "Listing not found" throw to 404', async () => {
    mockFrom.mockReturnValue(
      createQueryBuilder({ data: { id: LISTING_ID, analysis: null }, error: null }),
    );
    mockFirstSaveAnalysis.mockRejectedValue(new Error('Listing not found'));

    const res = await getAnalysis(LISTING_ID);
    expect(res.status).toBe(404);
  });

  it('returns a generic 500 on an unexpected core throw', async () => {
    mockFrom.mockReturnValue(
      createQueryBuilder({ data: { id: LISTING_ID, analysis: null }, error: null }),
    );
    mockFirstSaveAnalysis.mockRejectedValue(new Error('provider exploded'));

    const res = await getAnalysis(LISTING_ID);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toMatch(/provider exploded/);
  });
});
