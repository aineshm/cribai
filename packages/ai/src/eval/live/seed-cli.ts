/**
 * AIN-93 live-eval harness — seed CLI (`seed | check | cleanup`).
 *
 * Mirrors `apps/web/.crm-e2e.mjs`'s shape (seed/check/cleanup subcommands,
 * service-role client) but resolves the account from env via
 * `provisionAndSignInTestUser` instead of a hardcoded user id, and targets
 * the FIXED 8-row truth table in `seed-truth.ts` instead of one ad hoc
 * fixture.
 *
 * `seed` wipes any prior AIN-93 fixture rows for the account, then inserts
 * the 8 rows fresh — idempotent by construction (rerunning always leaves
 * exactly the 8 truth rows, never duplicates). `cleanup` performs the same
 * wipe with no re-insert. Both scope the delete to
 * `user_id = <account> AND source_url LIKE 'https://ain93-fixture.invalid/%'`
 * — the harness NEVER touches a row outside that fixture namespace, so a
 * real saved listing the account owns is never at risk.
 *
 * Run via: `pnpm eval:live -- seed|check|cleanup` (see `run-live-eval.ts`
 * for the combined `pnpm eval:live` entry, which calls `seed` implicitly
 * as a preflight — this file is also directly invocable for standalone
 * seed maintenance).
 */

import { pathToFileURL } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveTargetConfig } from './config';
import { provisionAndSignInTestUser } from './auth';
import {
  FIXTURE_URL_PREFIX,
  SEED_LISTING_KEYS,
  SEED_LISTINGS,
  buildSeedInsertRows,
  type SeedListingKey,
  type SeedListingTruth,
} from './seed-truth';

const FIXTURE_LIKE_PATTERN = `${FIXTURE_URL_PREFIX}%`;

// ---------------------------------------------------------------------------
// Pure-ish DB operations (accept a real SupabaseClient; unit-testable with a
// stubbed `.from()` chain, same convention as crm/__tests__/add-listing.test.ts)
// ---------------------------------------------------------------------------

/**
 * Delete every AIN-93 fixture row for `userId`. Scoped by BOTH `user_id` and
 * the fixture `source_url` prefix — never a bare `delete().eq('user_id', …)`,
 * which would wipe the account's real saved listings too.
 */
export async function wipeFixtureRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { error, count } = await supabase
    .from('crm_listings')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .like('source_url', FIXTURE_LIKE_PATTERN);

  if (error) {
    throw new Error(`AIN-93 seed-cli: wipe failed: ${error.message}`);
  }
  return count ?? 0;
}

function keyFromSourceUrl(sourceUrl: unknown): SeedListingKey | null {
  if (typeof sourceUrl !== 'string' || !sourceUrl.startsWith(FIXTURE_URL_PREFIX)) return null;
  const key = sourceUrl.slice(FIXTURE_URL_PREFIX.length);
  return (SEED_LISTING_KEYS as readonly string[]).includes(key) ? (key as SeedListingKey) : null;
}

export interface SeededRow {
  readonly key: SeedListingKey;
  readonly id: string;
}

/** Insert the fixed 8-row truth set for `userId`. Returns each row's DB id keyed by fixture key. */
export async function insertFixtureRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<readonly SeededRow[]> {
  const rows = buildSeedInsertRows(userId);
  const { data, error } = await supabase
    .from('crm_listings')
    .insert(rows)
    .select('id, source_url');

  if (error || !data) {
    throw new Error(`AIN-93 seed-cli: insert failed: ${error?.message ?? 'no rows returned'}`);
  }

  const seeded: SeededRow[] = [];
  for (const row of data as ReadonlyArray<{ id: string; source_url: string }>) {
    const key = keyFromSourceUrl(row.source_url);
    if (key) seeded.push({ key, id: row.id });
  }

  const missing = SEED_LISTING_KEYS.filter((key) => !seeded.some((s) => s.key === key));
  if (missing.length > 0) {
    throw new Error(
      `AIN-93 seed-cli: insert returned ${seeded.length}/${SEED_LISTING_KEYS.length} rows — missing keys: ${missing.join(', ')}`,
    );
  }
  return seeded;
}

/** Fetch the 8 fixture rows back for verification / id resolution. */
export async function fetchFixtureRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<readonly Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('crm_listings')
    .select('id, source_url, nickname, title, address, rent, bedrooms, bathrooms, sqft, amenities, status')
    .eq('user_id', userId)
    .like('source_url', FIXTURE_LIKE_PATTERN);

  if (error) {
    throw new Error(`AIN-93 seed-cli: fetch failed: ${error.message}`);
  }
  return (data ?? []) as readonly Record<string, unknown>[];
}

/** Resolve `key -> DB id` for the 8 seeded rows. Throws if any key is missing (re-seed needed). */
export async function resolveSeedListingIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Readonly<Record<SeedListingKey, string>>> {
  const rows = await fetchFixtureRows(supabase, userId);
  const map: Partial<Record<SeedListingKey, string>> = {};
  for (const row of rows) {
    const key = keyFromSourceUrl(row.source_url);
    if (key && typeof row.id === 'string') map[key] = row.id;
  }
  const missing = SEED_LISTING_KEYS.filter((key) => !map[key]);
  if (missing.length > 0) {
    throw new Error(
      `AIN-93: seeded rows missing for keys [${missing.join(', ')}] — run ` +
        "'pnpm eval:live -- seed' first.",
    );
  }
  return map as Record<SeedListingKey, string>;
}

// ---------------------------------------------------------------------------
// Diffing (used by `check`)
// ---------------------------------------------------------------------------

const NUMERIC_FIELDS = ['rent', 'bedrooms', 'bathrooms', 'sqft'] as const;

/** Compare a fetched DB row against its truth entry. Returns mismatch descriptions (empty = match). */
export function diffSeedRow(
  truth: SeedListingTruth,
  row: Record<string, unknown>,
): readonly string[] {
  const mismatches: string[] = [];

  for (const field of NUMERIC_FIELDS) {
    const expected = truth[field];
    const actual = row[field];
    const actualNum = actual === null || actual === undefined ? null : Number(actual);
    if (expected !== actualNum) {
      mismatches.push(`${field}: expected ${expected}, got ${actualNum}`);
    }
  }

  if (row.address !== truth.address) {
    mismatches.push(`address: expected ${JSON.stringify(truth.address)}, got ${JSON.stringify(row.address)}`);
  }
  if (row.status !== truth.status) {
    mismatches.push(`status: expected ${truth.status}, got ${String(row.status)}`);
  }
  if (row.nickname !== truth.nickname) {
    mismatches.push(`nickname: expected ${JSON.stringify(truth.nickname)}, got ${JSON.stringify(row.nickname)}`);
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'seed' && command !== 'check' && command !== 'cleanup') {
    throw new Error('usage: tsx seed-cli.ts seed|check|cleanup');
  }

  // Defense in depth: the seed CLI mutates real crm_listings rows against
  // whichever Supabase project NEXT_PUBLIC_SUPABASE_URL points at, so it
  // requires the SAME explicit target confirmation as the turn runner.
  resolveTargetConfig();

  const { createSecretClient } = await import('@campusnest/supabase/server');
  const supabase = createSecretClient() as unknown as SupabaseClient;
  const user = await provisionAndSignInTestUser();

  if (command === 'seed') {
    const wiped = await wipeFixtureRows(supabase, user.id);
    const seeded = await insertFixtureRows(supabase, user.id);
    console.log(
      JSON.stringify({ ok: true, command, userId: user.id, wiped, seededCount: seeded.length }, null, 2),
    );
    return;
  }

  if (command === 'check') {
    const rows = await fetchFixtureRows(supabase, user.id);
    const bySourceUrl = new Map(rows.map((row) => [row.source_url as string, row]));
    const report = SEED_LISTING_KEYS.map((key) => {
      const truth = SEED_LISTINGS[key];
      const row = bySourceUrl.get(truth.sourceUrl);
      return {
        key,
        present: Boolean(row),
        mismatches: row ? diffSeedRow(truth, row) : ['row not found'],
      };
    });
    console.log(JSON.stringify({ ok: true, command, userId: user.id, report }, null, 2));
    return;
  }

  const wiped = await wipeFixtureRows(supabase, user.id);
  console.log(JSON.stringify({ ok: true, command, userId: user.id, wiped }, null, 2));
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error('[ain93 seed-cli] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
