/**
 * AIN-93 Task 2 — dedicated-account auth. `@supabase/supabase-js` is
 * module-mocked (same pattern as `tools/__tests__/create-sublease*.test.ts`)
 * so no network call is ever made.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { provisionAndSignInTestUser } from '../auth';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const BASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SECRET_KEY: 'secret-key',
  E2E_TEST_USER_EMAIL: 'ain93-eval@example.edu',
  E2E_TEST_USER_PASSWORD: 'correct-horse-battery-staple',
};

function mockClients(opts: {
  createUserError?: { message: string; status?: number } | null;
  signInError?: { message: string } | null;
  signInData?: { session: { access_token: string } | null; user: { id: string; email: string } | null };
}) {
  const adminClient = {
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({ error: opts.createUserError ?? null }),
      },
    },
  };
  const anonClient = {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: opts.signInData ?? {
          session: { access_token: 'real-access-token' },
          user: { id: 'user-uuid-1', email: BASE_ENV.E2E_TEST_USER_EMAIL },
        },
        error: opts.signInError ?? null,
      }),
    },
  };
  (createClient as unknown as ReturnType<typeof vi.fn>).mockReset();
  (createClient as unknown as ReturnType<typeof vi.fn>)
    .mockReturnValueOnce(adminClient)
    .mockReturnValueOnce(anonClient);
  return { adminClient, anonClient };
}

describe('provisionAndSignInTestUser', () => {
  beforeEach(() => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it('throws when a required env var is missing', async () => {
    await expect(
      provisionAndSignInTestUser({ ...BASE_ENV, E2E_TEST_USER_EMAIL: undefined }),
    ).rejects.toThrow(/E2E_TEST_USER_EMAIL must be set/);
  });

  it('provisions (idempotent) then signs in, returning id/email/accessToken', async () => {
    mockClients({});
    const user = await provisionAndSignInTestUser(BASE_ENV);
    expect(user).toEqual({
      id: 'user-uuid-1',
      email: BASE_ENV.E2E_TEST_USER_EMAIL,
      accessToken: 'real-access-token',
    });
  });

  it('swallows a duplicate-user createUser error and proceeds to sign in', async () => {
    mockClients({ createUserError: { message: 'User already registered', status: 422 } });
    const user = await provisionAndSignInTestUser(BASE_ENV);
    expect(user.accessToken).toBe('real-access-token');
  });

  it('throws on a non-duplicate createUser error', async () => {
    mockClients({ createUserError: { message: 'service unavailable' } });
    await expect(provisionAndSignInTestUser(BASE_ENV)).rejects.toThrow(/admin.createUser failed/);
  });

  it('skips provisioning entirely when E2E_SKIP_USER_PROVISION=true', async () => {
    const anonClient = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'tok' }, user: { id: 'u1', email: BASE_ENV.E2E_TEST_USER_EMAIL } },
          error: null,
        }),
      },
    };
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(anonClient);

    const user = await provisionAndSignInTestUser({
      ...BASE_ENV,
      SUPABASE_SECRET_KEY: undefined,
      E2E_SKIP_USER_PROVISION: 'true',
    });

    expect(user.accessToken).toBe('tok');
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('throws when signInWithPassword fails', async () => {
    mockClients({ signInError: { message: 'invalid credentials' } });
    await expect(provisionAndSignInTestUser(BASE_ENV)).rejects.toThrow(/signInWithPassword failed/);
  });
});
