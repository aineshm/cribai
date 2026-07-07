/**
 * AIN-93 live-eval harness — dedicated seeded-account auth.
 *
 * `packages/ai` cannot depend on `apps/web`, so this deliberately mirrors
 * (rather than imports) `apps/web/tests/e2e/utils/test-user-auth.ts`'s
 * recipe: an idempotent service-role `admin.createUser` (duplicate-email
 * errors swallowed) followed by an anon `signInWithPassword` for a REAL
 * session access token — the same Bearer-token path production users hit.
 * Reuses the SAME env var names (`E2E_TEST_USER_EMAIL` / `_PASSWORD` /
 * `E2E_SKIP_USER_PROVISION`) so one dedicated account serves both the
 * Playwright E2E suite and this harness.
 *
 * Never hardcodes credentials — every value comes from env, and provisioning
 * is skippable (`E2E_SKIP_USER_PROVISION=true`) for a shared/prod Supabase
 * where the test user is expected to already exist.
 */

import { createClient } from '@supabase/supabase-js';

export interface LiveTestUser {
  readonly id: string;
  readonly email: string;
  readonly accessToken: string;
}

export interface LiveAuthEnv {
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly SUPABASE_SECRET_KEY?: string;
  readonly E2E_TEST_USER_EMAIL?: string;
  readonly E2E_TEST_USER_PASSWORD?: string;
  readonly E2E_SKIP_USER_PROVISION?: string;
}

function requireEnv(env: LiveAuthEnv, name: keyof LiveAuthEnv): string {
  const value = env[name];
  if (!value) {
    throw new Error(
      `AIN-93 auth: ${name} must be set in env (no hardcoded default — see ` +
        'packages/ai/src/eval/live/README or apps/web/.env.local).',
    );
  }
  return value;
}

function isDuplicateUserError(error: { message?: string; status?: number }): boolean {
  const msg = (error.message ?? '').toLowerCase();
  return (
    msg.includes('already') ||
    msg.includes('exists') ||
    msg.includes('registered') ||
    (error.status ?? 0) === 422
  );
}

/**
 * Provision the dedicated eval account (idempotent, skippable) and sign in
 * for a real session. Throws with an actionable message on any failure —
 * this harness never falls back to a dev/cookie auth path.
 */
export async function provisionAndSignInTestUser(
  env: LiveAuthEnv = process.env,
): Promise<LiveTestUser> {
  const url = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const email = requireEnv(env, 'E2E_TEST_USER_EMAIL');
  const password = requireEnv(env, 'E2E_TEST_USER_PASSWORD');

  if (env.E2E_SKIP_USER_PROVISION !== 'true') {
    const secretKey = requireEnv(env, 'SUPABASE_SECRET_KEY');
    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error && !isDuplicateUserError(created.error)) {
      throw new Error(`AIN-93 auth: admin.createUser failed: ${created.error.message}`);
    }
  }

  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(
      `AIN-93 auth: signInWithPassword failed: ${error?.message ?? 'no session'} ` +
        '(if pointed at shared/prod Supabase, pre-provision the user and set ' +
        'E2E_SKIP_USER_PROVISION=true).',
    );
  }

  return {
    id: data.user.id,
    email: data.user.email ?? email,
    accessToken: data.session.access_token,
  };
}
