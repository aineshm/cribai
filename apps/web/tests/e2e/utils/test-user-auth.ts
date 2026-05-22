/**
 * Real-user auth for E2E tests.
 *
 * The chat HITL flow (schedule_tour) requires a real Supabase session —
 * BYPASS_AUTH=true would route through the dev-cookie path (DEV_USERS in
 * apps/web/lib/dev-auth.ts) which the AIN-32 spec deliberately avoids: we
 * want the same Bearer-token code path that production users hit.
 *
 * Strategy:
 *   1. Service-role client provisions an idempotent test user
 *      (admin.createUser; ignore the "already exists" error so reruns work).
 *   2. Anon client signs in with password → real session JWT.
 *   3. We plant the session into the browser context as the chunked,
 *      base64url-encoded cookie that @supabase/ssr's createBrowserClient
 *      and createServerComponentClient both read (storage key
 *      `sb-<projectRef>-auth-token`).
 *   4. The next page.goto() hydrates with isAuthenticated=true and every
 *      subsequent fetch from cribai-chat.tsx attaches the Bearer header.
 *
 * The test user is intentionally persistent across runs (we don't delete it
 * in afterAll) — the user row in auth.users is reused, and only its
 * tour_requests / conversations rows are cleaned up per-test in
 * db-assertions.ts.
 */
import type { BrowserContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadTestEnvOnce } from './load-test-env';

/**
 * Test user credentials MUST come from env. We intentionally do NOT carry
 * hardcoded defaults — a default password in source means anyone reading
 * the repo could sign in as the test user against any environment where
 * E2E_SKIP_USER_PROVISION is misconfigured (or where the default user
 * happens to exist). Fail-fast and require explicit env wiring instead.
 *
 * Local dev: set E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD in
 * apps/web/.env.local (already gitignored).
 */
function getTestUserEmail(): string {
  const email = process.env.E2E_TEST_USER_EMAIL;
  if (!email) {
    throw new Error(
      'test-user-auth: E2E_TEST_USER_EMAIL must be set in env ' +
        '(no hardcoded default — see apps/web/.env.local).',
    );
  }
  return email;
}

function getTestUserPassword(): string {
  const password = process.env.E2E_TEST_USER_PASSWORD;
  if (!password) {
    throw new Error(
      'test-user-auth: E2E_TEST_USER_PASSWORD must be set in env ' +
        '(no hardcoded default — see apps/web/.env.local).',
    );
  }
  return password;
}

/**
 * When true, skip the admin.createUser provisioning step and assume the
 * test user already exists in Supabase auth.users. Set this in any
 * environment where the test should NOT write to auth.users (e.g. when
 * pointed at production Supabase).
 */
function shouldSkipProvision(): boolean {
  return process.env.E2E_SKIP_USER_PROVISION === 'true';
}

export interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly accessToken: string;
  readonly refreshToken: string;
}

let cached: Promise<TestUser> | null = null;

/**
 * Provision the test user (idempotent) and mint a real session. Cached at the
 * module level so all tests in a run share one auth round-trip.
 */
export function getTestUserSession(): Promise<TestUser> {
  if (!cached) cached = provisionAndSignIn();
  return cached;
}

async function provisionAndSignIn(): Promise<TestUser> {
  loadTestEnvOnce();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  const email = getTestUserEmail();
  const password = getTestUserPassword();

  if (!url || !anonKey) {
    throw new Error(
      'test-user-auth: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set',
    );
  }

  // Provisioning step is skipped against shared Supabase (e.g. production):
  // the test user is expected to exist already. Local-only runs that point at
  // a throwaway Supabase will run the provisioning branch and create the user
  // idempotently.
  if (!shouldSkipProvision()) {
    if (!serviceKey) {
      throw new Error(
        'test-user-auth: SUPABASE_SECRET_KEY required to provision the test user; ' +
          'set E2E_SKIP_USER_PROVISION=true to use a pre-existing user instead.',
      );
    }
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // The Supabase admin API returns a 422-style error on duplicate email;
    // we swallow that and proceed to sign-in. Other errors surface so we
    // don't paper over genuine misconfiguration.
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) {
      const msg = (created.error.message ?? '').toLowerCase();
      const isDuplicate =
        msg.includes('already') ||
        msg.includes('exists') ||
        msg.includes('registered') ||
        (created.error.status ?? 0) === 422;
      if (!isDuplicate) {
        throw new Error(
          `test-user-auth: admin.createUser failed: ${created.error.message}`,
        );
      }
    }
  }

  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session || !data.user) {
    throw new Error(
      `test-user-auth: signInWithPassword failed: ${error?.message ?? 'no session'} ` +
        '(if pointed at shared Supabase, set E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD ' +
        'and pre-provision the user).',
    );
  }

  return {
    id: data.user.id,
    email: data.user.email ?? email,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

/**
 * Extract the project ref from the Supabase URL.
 * Example: https://yzplusypxgvqkrmejcuf.supabase.co → yzplusypxgvqkrmejcuf
 *
 * @supabase/ssr derives the cookie name as `sb-${projectRef}-auth-token`.
 */
function projectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const match = url.match(/^https?:\/\/([^.]+)\./);
  if (!match) throw new Error(`Cannot extract project ref from ${url}`);
  return match[1];
}

/**
 * base64url-encode a UTF-8 string. Mirrors @supabase/ssr's
 * stringToBase64URL — Node's `Buffer.from(s).toString('base64url')` is
 * functionally identical for valid UTF-8 input.
 */
function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/**
 * Plant the session JWT into the browser context as the chunked
 * base64url-prefixed cookie that both createBrowserClient and
 * createServerComponentClient read.
 *
 * The format (see @supabase/ssr cookies.js):
 *   key  = sb-<projectRef>-auth-token
 *   raw  = JSON.stringify({access_token, refresh_token, expires_at, ...})
 *   value = "base64-" + base64url(raw)
 *   if value <= 3180 bytes → stored as single cookie at `key`
 *   else                   → split into key.0, key.1, ... chunks
 *
 * Our session JSON is well under 3180 bytes for typical Supabase sessions
 * (~1.2-1.5KB), so a single cookie suffices. If this changes we'll need to
 * call the package's createChunks helper; for now keep it simple.
 */
export async function plantSession(
  context: BrowserContext,
  user: TestUser,
): Promise<void> {
  const url = new URL(process.env.BASE_URL ?? 'http://localhost:3000');
  const cookieName = `sb-${projectRef()}-auth-token`;

  const session = {
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: user.id, email: user.email },
  };
  const encoded = `base64-${toBase64Url(JSON.stringify(session))}`;

  await context.addCookies([
    {
      name: cookieName,
      value: encoded,
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 86400,
    },
  ]);
}
