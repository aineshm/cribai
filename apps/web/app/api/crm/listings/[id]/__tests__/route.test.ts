/**
 * Tests for DELETE /api/crm/listings/[id] (AIN-61) — archive (soft delete).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createQueryBuilder } from '../../../__tests__/test-helpers';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@campusnest/supabase/server', () => ({
  createServerComponentClient: vi.fn(() => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
  createSecretClient: vi.fn(() => ({ from: vi.fn() })),
}));

import { DELETE, PATCH } from '../route';

const USER = { id: 'u-1', email: 'emma@wisc.edu' };
const LISTING_ID = 'b7e8f3a0-1111-4222-8333-444455556666';

function deleteRequest(id: string) {
  const request = new NextRequest(`http://localhost/api/crm/listings/${id}`, {
    method: 'DELETE',
  });
  return DELETE(request, { params: Promise.resolve({ id }) });
}

function patchRequest(id: string, body: unknown) {
  const request = new NextRequest(`http://localhost/api/crm/listings/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PATCH(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: USER }, error: null });
});

describe('DELETE /api/crm/listings/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await deleteRequest(LISTING_ID);
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 400 on a non-UUID id', async () => {
    const res = await deleteRequest('not-a-uuid');
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("archives the user's own row and returns 204", async () => {
    const builder = createQueryBuilder({ data: [{ id: LISTING_ID }], error: null });
    mockFrom.mockReturnValue(builder);

    const res = await deleteRequest(LISTING_ID);
    expect(res.status).toBe(204);

    expect(mockFrom).toHaveBeenCalledWith('crm_listings');
    expect(builder.update).toHaveBeenCalledWith({ status: 'archived' });
    expect(builder.eq).toHaveBeenCalledWith('id', LISTING_ID);
    // RLS-proxy assertion: a second user's row can never match.
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u-1');
  });

  it("returns 404 when the row does not exist (or belongs to another user)", async () => {
    mockFrom.mockReturnValue(createQueryBuilder({ data: [], error: null }));
    const res = await deleteRequest(LISTING_ID);
    expect(res.status).toBe(404);
  });

  it('returns 500 on a db error', async () => {
    mockFrom.mockReturnValue(createQueryBuilder({ data: null, error: { message: 'boom' } }));
    const res = await deleteRequest(LISTING_ID);
    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/crm/listings/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await patchRequest(LISTING_ID, { nickname: 'Cozy Regent studio' });
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 400 on a non-UUID id', async () => {
    const res = await patchRequest('not-a-uuid', { nickname: 'Cozy Regent studio' });
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("renames the user's own row and returns 200 with the updated row", async () => {
    const builder = createQueryBuilder({
      data: [{ id: LISTING_ID, nickname: 'Cozy Regent studio' }],
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const res = await patchRequest(LISTING_ID, { nickname: 'Cozy Regent studio' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ listing: { id: LISTING_ID, nickname: 'Cozy Regent studio' } });

    expect(mockFrom).toHaveBeenCalledWith('crm_listings');
    expect(builder.update).toHaveBeenCalledWith({ nickname: 'Cozy Regent studio' });
    expect(builder.eq).toHaveBeenCalledWith('id', LISTING_ID);
    // RLS-proxy assertion: a second user's row can never match.
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u-1');
  });

  it('trims the nickname before writing it', async () => {
    const builder = createQueryBuilder({
      data: [{ id: LISTING_ID, nickname: 'Cozy Regent studio' }],
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const res = await patchRequest(LISTING_ID, { nickname: '  Cozy Regent studio  ' });
    expect(res.status).toBe(200);
    expect(builder.update).toHaveBeenCalledWith({ nickname: 'Cozy Regent studio' });
  });

  it('rejects an extra field in the body with 400', async () => {
    const res = await patchRequest(LISTING_ID, {
      nickname: 'Cozy Regent studio',
      title: 'Hijacked title',
    });
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('rejects a nickname over 60 characters with 400', async () => {
    const res = await patchRequest(LISTING_ID, { nickname: 'x'.repeat(61) });
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects an empty nickname with 400', async () => {
    const res = await patchRequest(LISTING_ID, { nickname: '' });
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only nickname with 400', async () => {
    const res = await patchRequest(LISTING_ID, { nickname: '   ' });
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects a missing nickname field with 400', async () => {
    const res = await patchRequest(LISTING_ID, {});
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON body', async () => {
    const request = new NextRequest(`http://localhost/api/crm/listings/${LISTING_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await PATCH(request, { params: Promise.resolve({ id: LISTING_ID }) });
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 404 when the row does not exist (or belongs to another user)', async () => {
    mockFrom.mockReturnValue(createQueryBuilder({ data: [], error: null }));
    const res = await patchRequest(LISTING_ID, { nickname: 'Cozy Regent studio' });
    expect(res.status).toBe(404);
  });

  it('returns 500 on a db error', async () => {
    mockFrom.mockReturnValue(createQueryBuilder({ data: null, error: { message: 'boom' } }));
    const res = await patchRequest(LISTING_ID, { nickname: 'Cozy Regent studio' });
    expect(res.status).toBe(500);
  });
});
