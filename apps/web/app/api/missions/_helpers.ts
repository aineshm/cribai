/**
 * Mission API helpers — shared auth resolution, ownership verification,
 * and response sanitization.
 *
 * Handles both production (Supabase Auth) and dev mode (cookie-based
 * fake users) authentication. Provides a query client abstraction that
 * uses service-role in dev mode to bypass RLS.
 */

import { cookies } from 'next/headers';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import { isDevAuthEnabled, getDevUserById, DEFAULT_DEV_USER, DEV_USER_COOKIE } from '../../../lib/dev-auth';

/** Resolve the authenticated user ID and a Supabase client.
 *  Accepts an optional Request to extract a Bearer token from the
 *  Authorization header — this covers cases where cookies are missing
 *  but the client sends the token explicitly (e.g. SteeringBar, MissionActionCard).
 *
 *  When auth comes from a Bearer token, the cookie-based client has no session
 *  so RLS would block all queries. In that case, `authViaBearerToken` is true
 *  and callers should use `getQueryClient()` which returns a service-role client.
 */
export async function resolveMissionAuth(request?: Request): Promise<{
  readonly userId: string | null;
  readonly supabase: ReturnType<typeof createServerComponentClient>;
  readonly authViaBearerToken: boolean;
}> {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  // In dev mode, resolve user from a cookie-based fake user system (no real auth)
  if (isDevAuthEnabled()) {
    const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
    const devUser = selectedId ? getDevUserById(selectedId) : DEFAULT_DEV_USER;
    return { userId: devUser?.id ?? DEFAULT_DEV_USER.id, supabase, authViaBearerToken: false };
  }

  // Check Authorization header for Bearer token FIRST.
  // When the client sends an explicit Bearer token (e.g. MissionLauncher,
  // SteeringBar), prefer it over cookies. This ensures `authViaBearerToken`
  // is true so callers use the service-role client for DB writes — the
  // cookie-based client's RLS context can be stale or missing even when
  // getUser() succeeds via cookies, causing inserts to fail silently.
  if (request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user: tokenUser }, error: tokenError } = await supabase.auth.getUser(token);
      if (!tokenError && tokenUser) {
        return { userId: tokenUser.id, supabase, authViaBearerToken: true };
      }
    }
  }

  // Fallback: cookie-based auth (for requests without a Bearer token)
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!error && user) {
    return { userId: user.id, supabase, authViaBearerToken: false };
  }

  return { userId: null, supabase, authViaBearerToken: false };
}

/**
 * Get the appropriate Supabase client for queries.
 * Uses service-role client when dev mode is active OR when auth came
 * via Bearer token (cookie-based client has no session → RLS blocks).
 */
export function getQueryClient(
  userScopedClient: ReturnType<typeof createServerComponentClient>,
  authViaBearerToken = false,
): ReturnType<typeof createServerComponentClient> {
  return (isDevAuthEnabled() || authViaBearerToken)
    ? createSecretClient() as any
    : userScopedClient;
}

// ---------------------------------------------------------------------------
// Response sanitization
// ---------------------------------------------------------------------------

/** Keys matching this pattern are considered secret-bearing and must never be
 *  echoed back to the client in mission.input (defense-in-depth for AIN-77). */
const SECRET_KEY_PATTERN = /key|secret|token|password|credential/i;

/**
 * Returns a shallow copy of `mission` with any key in `mission.input` whose
 * name matches /key|secret|token|password|credential/i removed.
 *
 * Immutable — does not mutate the input object.
 * If `mission.input` is absent or not a plain object, returns mission unchanged.
 *
 * NOTE: shallow only — strips top-level keys of `input`. Mission input must
 * stay flat (crm_deep_extract uses `{ listingId, sourceUrl }`); a nested object
 * with a secret-named key one level down would not be stripped.
 */
export function redactMissionSecrets(
  mission: Record<string, unknown>,
): Record<string, unknown> {
  const input = mission.input;
  if (
    input === null ||
    input === undefined ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    return mission;
  }

  const sanitizedInput = Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(
      ([key]) => !SECRET_KEY_PATTERN.test(key),
    ),
  );

  return { ...mission, input: sanitizedInput };
}

// ---------------------------------------------------------------------------
// Ownership verification
// ---------------------------------------------------------------------------

/**
 * Verify a mission belongs to the given user.
 * Returns the mission row or null if not found/not owned.
 */
export async function verifyMissionOwnership(
  supabase: ReturnType<typeof createServerComponentClient>,
  missionId: string,
  userId: string,
  authViaBearerToken = false,
): Promise<Record<string, unknown> | null> {
  const queryClient = getQueryClient(supabase, authViaBearerToken);

  const { data, error } = await queryClient
    .from('missions')
    .select('*')
    .eq('id', missionId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Record<string, unknown>;
}
