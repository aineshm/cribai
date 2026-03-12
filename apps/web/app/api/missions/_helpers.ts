import { cookies } from 'next/headers';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import { isDevAuthEnabled, getDevUserById, DEFAULT_DEV_USER, DEV_USER_COOKIE } from '../../../lib/dev-auth';

/** Resolve the authenticated user ID and a Supabase client. */
export async function resolveMissionAuth(): Promise<{
  readonly userId: string | null;
  readonly supabase: ReturnType<typeof createServerComponentClient>;
}> {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  if (isDevAuthEnabled()) {
    const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
    const devUser = selectedId ? getDevUserById(selectedId) : DEFAULT_DEV_USER;
    return { userId: devUser?.id ?? DEFAULT_DEV_USER.id, supabase };
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  return { userId: (!error && user) ? user.id : null, supabase };
}

/**
 * Get the appropriate Supabase client for queries.
 * In dev mode, returns a service-role client to bypass RLS.
 */
export function getQueryClient(
  userScopedClient: ReturnType<typeof createServerComponentClient>,
): ReturnType<typeof createServerComponentClient> {
  return isDevAuthEnabled() ? createSecretClient() as any : userScopedClient;
}

/**
 * Verify a mission belongs to the given user.
 * Returns the mission row or null if not found/not owned.
 */
export async function verifyMissionOwnership(
  supabase: ReturnType<typeof createServerComponentClient>,
  missionId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const queryClient = getQueryClient(supabase);

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
