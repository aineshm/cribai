/**
 * Mission API helpers — shared auth resolution and ownership verification.
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

  // Try cookie-based auth first
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!error && user) {
    return { userId: user.id, supabase, authViaBearerToken: false };
  }

  // Fallback: check Authorization header for Bearer token.
  // The cookie-based supabase client won't have this user's session,
  // so RLS will fail — callers must use service-role client for DB ops.
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
