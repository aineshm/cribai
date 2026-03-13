import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Disable dev auth for all production path tests
vi.mock('../dev-auth', () => ({
  isDevAuthEnabled: vi.fn().mockReturnValue(false),
  getDevUserById: vi.fn(),
  DEFAULT_DEV_USER: { id: 'dev-1', email: 'dev@wisc.edu', displayName: 'Dev' },
  DEV_USER_COOKIE: 'dev_user_id',
  toSupabaseUser: vi.fn(),
}));

// Supabase env vars must be set for the middleware to proceed past the guard
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

// Control what getUser returns
let mockUser: { id: string; email: string } | null = null;

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: mockUser },
      })),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Helper — build a NextRequest
// ---------------------------------------------------------------------------
function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`https://campusnest.app${pathname}`);
}

// ---------------------------------------------------------------------------
// Import middleware AFTER mocks are set
// ---------------------------------------------------------------------------
// We use a dynamic import inside each test so module-level mocks are applied.
async function runMiddleware(pathname: string) {
  const { proxy } = await import('../../proxy');
  const req = makeRequest(pathname);
  return proxy(req);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('middleware — flat route protection', () => {
  beforeEach(() => {
    vi.resetModules(); // fresh middleware import each test
    mockUser = null; // default: unauthenticated
  });

  it('redirects unauthenticated user from /post to /login?returnTo=/post', async () => {
    mockUser = null;
    const response = await runMiddleware('/post');

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const url = new URL(location!);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('returnTo')).toBe('/post');
    // Must NOT use 'next' param
    expect(url.searchParams.get('next')).toBeNull();
  });

  it('redirects unauthenticated user from /profile to /login?returnTo=/profile', async () => {
    mockUser = null;
    const response = await runMiddleware('/profile');

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const url = new URL(location!);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('returnTo')).toBe('/profile');
    expect(url.searchParams.get('next')).toBeNull();
  });

  it('allows authenticated user through /post without redirect', async () => {
    mockUser = { id: 'user-1', email: 'user@wisc.edu' };
    const response = await runMiddleware('/post');

    // Should NOT be a redirect (200 or no Location header)
    expect(response.status).not.toBe(307);
    expect(response.status).not.toBe(302);
  });
});

describe('middleware — campus route protection', () => {
  beforeEach(() => {
    vi.resetModules();
    mockUser = null;
  });

  it('redirects unauthenticated user from /uw-madison/cribai to /login', async () => {
    mockUser = null;
    const response = await runMiddleware('/uw-madison/cribai');

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const url = new URL(location!);
    expect(url.pathname).toBe('/login');
  });

  it('uses returnTo (not next) query param for campus route redirects', async () => {
    mockUser = null;
    const response = await runMiddleware('/uw-madison/cribai');

    const location = response.headers.get('location');
    const url = new URL(location!);
    expect(url.searchParams.get('returnTo')).toBe('/uw-madison/cribai');
    expect(url.searchParams.get('next')).toBeNull();
  });
});
