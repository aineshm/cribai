/**
 * AIN-9 review FIX 2 (runner-level) — the eval runner MUST refuse to build a
 * service-role ToolContext against a non-explicit-prod project unless the
 * caller opts in via `EVAL_ALLOW_PROD=1`. Without this gate, a stray `pnpm
 * eval` against `NEXT_PUBLIC_SUPABASE_URL` pointing at the prod project would
 * exercise the dryRun handler gate but still target prod via service-role
 * reads — fail-closed is cheaper than fail-open.
 *
 * The rule:
 *   1. EVAL_CAMPUS_ID + EVAL_USER_ID are required (existing behavior).
 *   2. If NEXT_PUBLIC_SUPABASE_URL looks like prod (no `localhost` and no
 *      `staging` substring) the runner refuses UNLESS EVAL_ALLOW_PROD=1 is
 *      set explicitly.
 *   3. EVAL_ALLOW_PROD=1 plus the existing env required by createSecretClient
 *      ("NEXT_PUBLIC_SUPABASE_URL" + "SUPABASE_SECRET_KEY") is the path for
 *      a deliberately-prod eval run.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildEvalToolContext } from '../run-eval';

const ENV_KEYS = [
  'EVAL_CAMPUS_ID',
  'EVAL_USER_ID',
  'EVAL_CAMPUS_SLUG',
  'EVAL_ALLOW_PROD',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}
function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
}

let snap: Record<string, string | undefined>;

beforeEach(() => {
  snap = snapshotEnv();
  // Strip everything; each test sets exactly what it needs.
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  restoreEnv(snap);
});

describe('buildEvalToolContext — FIX 2 safety gate', () => {
  it('refuses to build a context when EVAL_CAMPUS_ID + EVAL_USER_ID are missing (existing rule)', async () => {
    await expect(buildEvalToolContext()).rejects.toThrow(/EVAL_CAMPUS_ID|EVAL_USER_ID/);
  });

  it('refuses to run against a prod-looking Supabase URL without EVAL_ALLOW_PROD=1', async () => {
    process.env.EVAL_CAMPUS_ID = 'campus-1';
    process.env.EVAL_USER_ID = 'user-1';
    // Looks like prod: no `localhost`, no `staging`.
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'sk-test-server';

    await expect(buildEvalToolContext()).rejects.toThrow(
      /EVAL_ALLOW_PROD|prod|production/,
    );
  });

  it('allows a localhost URL without EVAL_ALLOW_PROD (non-prod marker)', async () => {
    process.env.EVAL_CAMPUS_ID = 'campus-1';
    process.env.EVAL_USER_ID = 'user-1';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'sk-test-server';

    const ctx = await buildEvalToolContext();
    expect(ctx.campusId).toBe('campus-1');
    expect(ctx.userId).toBe('user-1');
    expect(ctx.dryRun).toBe(true);
  });

  it('allows a staging URL without EVAL_ALLOW_PROD (non-prod marker)', async () => {
    process.env.EVAL_CAMPUS_ID = 'campus-1';
    process.env.EVAL_USER_ID = 'user-1';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://staging.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'sk-test-server';

    const ctx = await buildEvalToolContext();
    expect(ctx.dryRun).toBe(true);
  });

  it('allows a prod URL when EVAL_ALLOW_PROD=1 is set explicitly', async () => {
    process.env.EVAL_CAMPUS_ID = 'campus-1';
    process.env.EVAL_USER_ID = 'user-1';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'sk-test-server';
    process.env.EVAL_ALLOW_PROD = '1';

    const ctx = await buildEvalToolContext();
    expect(ctx.dryRun).toBe(true);
  });
});
