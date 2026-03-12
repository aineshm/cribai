import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEV_USERS,
  DEFAULT_DEV_USER,
  DEV_USER_COOKIE,
  isDevAuthEnabled,
  getDevUserById,
  toSupabaseUser,
} from '../dev-auth';

describe('DEV_USERS', () => {
  it('contains exactly 4 dev users', () => {
    expect(DEV_USERS).toHaveLength(4);
  });

  it('has unique IDs for all users', () => {
    const ids = DEV_USERS.map(u => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique emails for all users', () => {
    const emails = DEV_USERS.map(u => u.email);
    expect(new Set(emails).size).toBe(emails.length);
  });
});

describe('DEFAULT_DEV_USER', () => {
  it('is the first user in DEV_USERS', () => {
    expect(DEFAULT_DEV_USER).toBe(DEV_USERS[0]);
  });
});

describe('DEV_USER_COOKIE', () => {
  it('is a non-empty string', () => {
    expect(DEV_USER_COOKIE).toBe('dev_user_id');
  });
});

describe('isDevAuthEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when NODE_ENV is not production and BYPASS_AUTH is true', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('BYPASS_AUTH', 'true');
    expect(isDevAuthEnabled()).toBe(true);
  });

  it('returns false when NODE_ENV is production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BYPASS_AUTH', 'true');
    expect(isDevAuthEnabled()).toBe(false);
  });

  it('returns false when BYPASS_AUTH is not set', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const originalBypassAuth = process.env.BYPASS_AUTH;
    delete process.env.BYPASS_AUTH;
    try {
      expect(isDevAuthEnabled()).toBe(false);
    } finally {
      if (originalBypassAuth === undefined) {
        delete process.env.BYPASS_AUTH;
      } else {
        process.env.BYPASS_AUTH = originalBypassAuth;
      }
    }
  });

  it('returns false when BYPASS_AUTH is a different string', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('BYPASS_AUTH', 'false');
    expect(isDevAuthEnabled()).toBe(false);
  });

  it('returns true in test environment with BYPASS_AUTH', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('BYPASS_AUTH', 'true');
    expect(isDevAuthEnabled()).toBe(true);
  });
});

describe('getDevUserById', () => {
  it('returns the correct user for a known ID', () => {
    const user = getDevUserById('a0000000-0000-4000-8000-000000000001');
    expect(user).toBeDefined();
    expect(user!.email).toBe('emma.chen@wisc.edu');
  });

  it('returns undefined for an unknown ID', () => {
    expect(getDevUserById('nonexistent-id')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(getDevUserById('')).toBeUndefined();
  });

  it('finds each dev user by their ID', () => {
    for (const user of DEV_USERS) {
      expect(getDevUserById(user.id)).toBe(user);
    }
  });
});

describe('toSupabaseUser', () => {
  it('maps DevUser fields to Supabase user shape', () => {
    const devUser = DEV_USERS[0]!;
    const supabaseUser = toSupabaseUser(devUser);

    expect(supabaseUser.id).toBe(devUser.id);
    expect(supabaseUser.email).toBe(devUser.email);
    expect(supabaseUser.aud).toBe('authenticated');
    expect(supabaseUser.role).toBe('authenticated');
    expect(supabaseUser.app_metadata).toEqual({});
    expect(supabaseUser.user_metadata.display_name).toBe(devUser.displayName);
    expect(supabaseUser.created_at).toBe('2025-01-01T00:00:00Z');
  });

  it('works for all dev users', () => {
    for (const devUser of DEV_USERS) {
      const result = toSupabaseUser(devUser);
      expect(result.id).toBe(devUser.id);
      expect(result.email).toBe(devUser.email);
      expect(result.user_metadata.display_name).toBe(devUser.displayName);
    }
  });
});
