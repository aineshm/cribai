import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock next/headers — submit-listing reads cookies()
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({})),
}));

// Mock next/server's `after()` — the route calls it for async embedding work,
// which throws "outside request scope" in unit tests. We don't exercise the
// embedding path here; the .edu gate runs before any after() registration.
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: vi.fn((cb: () => unknown) => {
      void cb;
    }),
  };
});

// Mock @campusnest/ai — we never want the test to call generateEmbedding
vi.mock('@campusnest/ai', () => ({
  synthesizeListingText: vi.fn(() => 'synthetic listing text'),
  generateEmbedding: vi.fn(async () => null),
}));

// Mock Supabase server clients. The auth call is the only one we care about
// for the .edu gate; the rest of the chain (.from(...).insert(...).select(...))
// is stubbed so the happy path still resolves.
const mockGetUser = vi.fn();
const mockProfileSingle = vi.fn();
const mockInsertSingle = vi.fn();

vi.mock('@campusnest/supabase/server', () => ({
  createServerComponentClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockProfileSingle,
    })),
  })),
  createSecretClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: mockInsertSingle,
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  })),
}));

import { POST } from '../route';

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/submit-listing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  address: '123 Test St, Madison, WI 53703',
  rent_monthly: 1200,
  bedrooms: 2,
  bathrooms: 1,
  amenities: ['parking'],
  description: 'Nice place near campus',
  contact_email: 'student@wisc.edu',
};

describe('POST /api/submit-listing — .edu gate (PDR-003 Track B Day 2)', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockProfileSingle.mockReset();
    mockInsertSingle.mockReset();
    mockProfileSingle.mockResolvedValue({ data: { campus_id: 'campus-1' } });
    mockInsertSingle.mockResolvedValue({
      data: { id: 'listing-1', address: validBody.address },
      error: null,
    });
  });

  it('returns 401 when no user is authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated user has a non-.edu email', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@gmail.com' } },
      error: null,
    });
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/\.edu/);
  });

  it('returns 403 when authenticated user has no email at all', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: null } },
      error: null,
    });
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(403);
  });

  it('allows a .edu user past the gate (proceeds to body validation / insert)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'student@wisc.edu' } },
      error: null,
    });
    const res = await POST(buildRequest(validBody));
    // Body is valid + insert is mocked → 201. The point of this assertion is
    // that we do NOT 403 a .edu user.
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(201);
  });

  it('treats .edu detection case-insensitively', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'STUDENT@WISC.EDU' } },
      error: null,
    });
    const res = await POST(buildRequest(validBody));
    expect(res.status).not.toBe(403);
  });

  it('rejects edu.com domains (substring is not enough)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@edu.com' } },
      error: null,
    });
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(403);
  });
});
