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

// Mock Supabase server clients. The auth call returns the authenticated user,
// the .from('profiles')...single() returns the profile row that controls the
// .edu gate (source of truth: profiles.is_edu_verified), and the service-role
// client handles the insert in the happy path.
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
    // Default: profile exists, is verified, has a campus_id — happy path.
    // Individual tests override mockProfileSingle to test the gate.
    mockProfileSingle.mockResolvedValue({
      data: { is_edu_verified: true, campus_id: 'campus-1' },
      error: null,
    });
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

  it('returns 403 when the profile row cannot be fetched (no profile)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'student@wisc.edu' } },
      error: null,
    });
    mockProfileSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows found' },
    });
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/verify-edu/);
  });

  it('returns 403 when the profile exists but is_edu_verified is false', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'student@wisc.edu' } },
      error: null,
    });
    mockProfileSingle.mockResolvedValue({
      data: { is_edu_verified: false, campus_id: 'campus-1' },
      error: null,
    });
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/\.edu/);
  });

  it('regression: non-.edu sign-in email + is_edu_verified=true → 201 (codex P1)', async () => {
    // A user who signs in with a personal gmail and then completes
    // /verify-edu with their school email must NOT be blocked. The
    // source of truth is the profile flag, not auth.users.email.
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@gmail.com' } },
      error: null,
    });
    mockProfileSingle.mockResolvedValue({
      data: { is_edu_verified: true, campus_id: 'campus-1' },
      error: null,
    });
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(201);
  });

  it('allows a verified user past the gate (proceeds to body validation / insert)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'student@wisc.edu' } },
      error: null,
    });
    // Default beforeEach already sets is_edu_verified=true
    const res = await POST(buildRequest(validBody));
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(201);
  });

  it('returns 400 when verified profile has no campus_id', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'student@wisc.edu' } },
      error: null,
    });
    mockProfileSingle.mockResolvedValue({
      data: { is_edu_verified: true, campus_id: null },
      error: null,
    });
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/campus/i);
  });
});
