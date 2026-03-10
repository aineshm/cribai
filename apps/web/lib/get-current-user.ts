import { cookies } from 'next/headers';
import { createServerComponentClient } from '@campusnest/supabase/server';
import {
  isDevAuthEnabled,
  getDevUserById,
  DEFAULT_DEV_USER,
  DEV_USER_COOKIE,
  type DevUser,
} from './dev-auth';

/**
 * Resolved user for server components — works in both production and dev bypass mode.
 */
export interface ResolvedUser {
  readonly id: string;
  readonly email: string;
  readonly isDevMode: boolean;
}

interface ResolvedAuthResult {
  /** null when not authenticated (production only — dev mode always returns a user) */
  readonly user: ResolvedUser | null;
  /** The Supabase client (real in production, real in dev too — for DB queries) */
  readonly supabase: ReturnType<typeof createServerComponentClient>;
  /** Dev user details (only present in dev bypass mode) */
  readonly devUser: DevUser | null;
}

/**
 * Unified auth resolver for server components.
 *
 * - Production: delegates to Supabase `getUser()`
 * - Dev mode (BYPASS_AUTH=true): reads `dev_user_id` cookie and returns mock user
 *
 * Always returns a real Supabase client so DB queries work in both modes.
 */
export async function getCurrentUser(): Promise<ResolvedAuthResult> {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  if (isDevAuthEnabled()) {
    const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
    const devUser = selectedId
      ? (getDevUserById(selectedId) ?? DEFAULT_DEV_USER)
      : DEFAULT_DEV_USER;

    return {
      user: {
        id: devUser.id,
        email: devUser.email,
        isDevMode: true,
      },
      supabase,
      devUser,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    user: user
      ? { id: user.id, email: user.email ?? '', isDevMode: false }
      : null,
    supabase,
    devUser: null,
  };
}
