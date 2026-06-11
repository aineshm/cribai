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

import { DELETE } from '../route';

const USER = { id: 'u-1', email: 'emma@wisc.edu' };
const LISTING_ID = 'b7e8f3a0-1111-4222-8333-444455556666';

function deleteRequest(id: string) {
  const request = new NextRequest(`http://localhost/api/crm/listings/${id}`, {
    method: 'DELETE',
  });
  return DELETE(request, { params: Promise.resolve({ id }) });
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
