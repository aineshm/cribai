/**
 * Dev-only auth bypass configuration.
 *
 * When BYPASS_AUTH=true is set in .env.local, the middleware and server
 * components use these mock users instead of real Supabase Auth.
 *
 * NEVER import this module in production builds — callers must guard
 * with `process.env.BYPASS_AUTH === 'true'` before using.
 */

export interface DevUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly label: string;
  readonly isEduVerified: boolean;
  readonly subscriptionTier: 'free' | 'pro' | 'premium';
  readonly graduationYear: number | null;
  readonly major: string | null;
  readonly avatarUrl: string | null;
}

/**
 * Deterministic UUIDs so seed data can reference them.
 * Generated offline — they never collide with real Supabase auth.users.
 */
export const DEV_USERS: readonly DevUser[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    email: 'emma.chen@wisc.edu',
    displayName: 'Emma Chen',
    label: 'Undergrad (free)',
    isEduVerified: true,
    subscriptionTier: 'free',
    graduationYear: 2027,
    major: 'Computer Science',
    avatarUrl: null,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    email: 'raj.patel@wisc.edu',
    displayName: 'Raj Patel',
    label: 'Grad student (pro)',
    isEduVerified: true,
    subscriptionTier: 'pro',
    graduationYear: 2026,
    major: 'Biomedical Engineering',
    avatarUrl: null,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    email: 'maria.garcia@wisc.edu',
    displayName: 'Maria Garcia',
    label: 'International (premium)',
    isEduVerified: true,
    subscriptionTier: 'premium',
    graduationYear: 2028,
    major: 'Economics',
    avatarUrl: null,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004',
    email: 'unverified@wisc.edu',
    displayName: 'New Student',
    label: 'Unverified user',
    isEduVerified: false,
    subscriptionTier: 'free',
    graduationYear: null,
    major: null,
    avatarUrl: null,
  },
] as const;

export const DEFAULT_DEV_USER = DEV_USERS[0]!;

/** Cookie name used to persist the selected dev user across page loads */
export const DEV_USER_COOKIE = 'dev_user_id';

export function isDevAuthEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.BYPASS_AUTH === 'true';
}

export function getDevUserById(id: string): DevUser | undefined {
  return DEV_USERS.find((u) => u.id === id);
}

/**
 * Build a minimal Supabase-compatible user object from a DevUser.
 * This is used by middleware and server components to fake `getUser()` results.
 */
export function toSupabaseUser(dev: DevUser) {
  return {
    id: dev.id,
    email: dev.email,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: { display_name: dev.displayName },
    created_at: '2025-01-01T00:00:00Z',
  } as const;
}
