/**
 * Shared auth resolution for the /api/crm/* route handlers (AIN-61).
 *
 * Mirrors the /api/conversations pattern exactly:
 *   - Production: RLS-bound client from the session cookies; `auth.getUser()`
 *     resolves the user. RLS (`user_id = auth.uid()`, migration 037) is the
 *     tenant boundary — no service-role client on the prod path.
 *   - Dev bypass (BYPASS_AUTH=true, non-production only): the selected dev
 *     user from the cookie + the service-role client (dev users have no real
 *     Supabase session, so RLS would return nothing). Every query still
 *     filters on user_id explicitly.
 *
 * `resolveCrmAuthFromBearer` is the companion path for non-browser callers
 * (e.g. the Chrome extension) that send a Supabase access token in the
 * Authorization header rather than in session cookies.
 */
import { cookies } from 'next/headers';
import {
  createServerComponentClient,
  createSecretClient,
  createBearerClient,
} from '@campusnest/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import {
  isDevAuthEnabled,
  getDevUserById,
  DEFAULT_DEV_USER,
  DEV_USER_COOKIE,
} from '../../../../lib/dev-auth';

export interface CrmAuth {
  readonly userId: string;
  /** Display name for the viewer (drives the synthesized single-member list). */
  readonly displayName: string;
  /** Query client: RLS-bound in production, service-role in dev-bypass mode. */
  readonly db: SupabaseClient;
}

/** Derive a human display name from Supabase user metadata, degrading to the email local part. */
function resolveDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const fromMetadata = user.user_metadata?.['display_name'];
  if (typeof fromMetadata === 'string' && fromMetadata.trim().length > 0) {
    return fromMetadata.trim();
  }
  const localPart = user.email?.split('@')[0];
  return localPart && localPart.length > 0 ? localPart : 'You';
}

/**
 * Resolve the authenticated CRM viewer. Returns null when unauthenticated —
 * callers must respond 401 and run no queries.
 */
export async function resolveCrmAuth(): Promise<CrmAuth | null> {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore) as unknown as SupabaseClient;

  if (isDevAuthEnabled()) {
    const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
    const devUser = (selectedId ? getDevUserById(selectedId) : undefined) ?? DEFAULT_DEV_USER;
    return {
      userId: devUser.id,
      displayName: devUser.displayName,
      db: createSecretClient() as unknown as SupabaseClient,
    };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  return {
    userId: user.id,
    displayName: resolveDisplayName(user),
    db: supabase,
  };
}

/**
 * Resolve auth from a Bearer token in the Authorization header.
 *
 * Used by the Chrome extension ingest route (`POST /api/crm/ingest`). The
 * extension cannot use cookies — it calls the API with the Supabase access
 * token it holds from the user's browser session. We validate the token
 * server-side via `auth.getUser()` (a real round-trip to Supabase auth) and
 * build an RLS-bound client scoped to that access token. Returned `db` is
 * RLS-enforced: `auth.uid()` resolves from the token, not a service role.
 *
 * Dev-bypass mode is intentionally NOT supported here — the extension always
 * ships a real token, and the dev bypass is a cookie-based shortcut for
 * browser sessions only.
 *
 * Returns null when:
 *   - No Authorization header is present.
 *   - Header is present but not in `Bearer <token>` form.
 *   - Token is invalid / expired (Supabase auth.getUser() fails).
 */
export async function resolveCrmAuthFromBearer(
  request: NextRequest,
): Promise<CrmAuth | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer' || !parts[1]) {
    return null;
  }

  const accessToken = parts[1];
  const supabase = createBearerClient(accessToken) as unknown as SupabaseClient;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  return {
    userId: user.id,
    displayName: resolveDisplayName(user),
    db: supabase,
  };
}
