/**
 * CLI entry point for the CRM capture retention sweep (AIN-84; closes AIN-79).
 * Run via: npx tsx packages/ai/src/cli/cleanup-captures.ts [--dry-run]
 *
 * DB-rows-drive-deletion: rows in crm_listing_captures older than the
 * retention window are listed, their gzipped objects removed from the private
 * `listing-captures` bucket in batches, then the rows deleted. Consumed and
 * unconsumed captures are swept uniformly (single age predicate on
 * captured_at — the 042 index serves it). A failed batch keeps its rows so
 * the next nightly run retries it; one bad batch never halts the sweep.
 *
 * Orphan storage objects (object without a row) are NOT swept in v1: the only
 * writer creates row+object together and an upload failure skips the row
 * write, so an orphan requires a partial-failure race. Log-only acceptable.
 *
 * Required environment variables:
 * - NEXT_PUBLIC_SUPABASE_URL: Supabase project URL
 * - SUPABASE_SECRET_KEY: Supabase service role key
 * Optional:
 * - CAPTURE_RETENTION_DAYS: positive integer, default 14
 */

import { pathToFileURL } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CAPTURE_BUCKET } from '@campusnest/supabase/storage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default retention window (days). Middle of the AIN-84 7–30 range. */
export const DEFAULT_RETENTION_DAYS = 14;

/** Objects removed per storage.remove() call / rows deleted per batch. */
export const SWEEP_BATCH_SIZE = 100;

/**
 * Page size for the expired-row select. PostgREST silently caps unranged
 * selects at 1000 rows — the sweep paginates with .range() so it never
 * silently bounds itself to the first 1000 expired captures.
 */
export const SELECT_PAGE_SIZE = 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Env validation (boundary)
// ---------------------------------------------------------------------------

/**
 * Parse CAPTURE_RETENTION_DAYS: must be a positive integer, otherwise warn
 * and fall back to the default. Never throws — the sweep should not die on a
 * typo'd env var.
 */
export function resolveRetentionDays(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_RETENTION_DAYS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn(
      `[cleanup-captures] invalid CAPTURE_RETENTION_DAYS ${JSON.stringify(raw)} — ` +
        `falling back to ${DEFAULT_RETENTION_DAYS}`,
    );
    return DEFAULT_RETENTION_DAYS;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

interface ExpiredCaptureRow {
  readonly listing_id: string;
  readonly storage_path: string;
}

export interface SweepOptions {
  readonly retentionDays: number;
  readonly dryRun?: boolean;
  readonly batchSize?: number;
  /** Injectable clock for tests. */
  readonly now?: Date;
  /** Select pagination size (tests only; defaults to SELECT_PAGE_SIZE). */
  readonly selectPageSize?: number;
}

export interface SweepSummary {
  readonly scanned: number;
  readonly removed: number;
  readonly failed: number;
  readonly dryRun: boolean;
}

/** Immutable chunking helper. */
function toBatches<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Remove one batch's storage objects, then delete its rows. Returns the number
 * of rows successfully removed (0 on any batch-level failure — the rows stay
 * and are retried by the next sweep). Never throws.
 */
async function sweepBatch(
  supabase: SupabaseClient,
  batch: readonly ExpiredCaptureRow[],
): Promise<number> {
  const paths = batch.map((row) => row.storage_path);
  const ids = batch.map((row) => row.listing_id);

  try {
    const { error: removeError } = await supabase.storage.from(CAPTURE_BUCKET).remove(paths);
    if (removeError) {
      console.warn('[cleanup-captures] storage remove failed for batch (rows retained):', removeError.message);
      return 0;
    }

    const { error: deleteError } = await supabase
      .from('crm_listing_captures')
      .delete()
      .in('listing_id', ids);
    if (deleteError) {
      // Objects are already gone but rows remain; the next sweep retries the
      // rows and storage.remove tolerates already-missing objects.
      console.warn('[cleanup-captures] row delete failed for batch (retried next run):', deleteError.message);
      return 0;
    }

    return batch.length;
  } catch (err) {
    console.warn(
      '[cleanup-captures] batch sweep threw (rows retained):',
      err instanceof Error ? err.message : String(err),
    );
    return 0;
  }
}

/**
 * Delete captures older than the retention window: storage objects first
 * (batched), then their pointer rows. Per-batch error isolation. Throws only
 * when the initial expired-row SELECT fails (the sweep cannot proceed at all).
 */
export async function sweepExpiredCaptures(
  supabase: SupabaseClient,
  options: SweepOptions,
): Promise<SweepSummary> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const batchSize = options.batchSize ?? SWEEP_BATCH_SIZE;
  const cutoff = new Date(now.getTime() - options.retentionDays * MS_PER_DAY).toISOString();

  // Paginate explicitly: PostgREST silently caps unranged selects at 1000
  // rows, which would silently bound the sweep. All pages are collected
  // BEFORE any deletion so the range offsets stay stable.
  const pageSize = options.selectPageSize ?? SELECT_PAGE_SIZE;
  let rows: readonly ExpiredCaptureRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('crm_listing_captures')
      .select('listing_id, storage_path')
      .lt('captured_at', cutoff)
      .order('captured_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`[cleanup-captures] expired-row select failed: ${error.message}`);
    }

    const page = (data ?? []) as ExpiredCaptureRow[];
    rows = [...rows, ...page];
    if (page.length < pageSize) break;
  }

  if (rows.length === 0) {
    return { scanned: 0, removed: 0, failed: 0, dryRun };
  }

  if (dryRun) {
    for (const row of rows) {
      console.log(`[cleanup-captures] dry-run: would remove ${row.storage_path}`);
    }
    return { scanned: rows.length, removed: 0, failed: 0, dryRun };
  }

  let removed = 0;
  for (const batch of toBatches(rows, batchSize)) {
    removed += await sweepBatch(supabase, batch);
  }

  return { scanned: rows.length, removed, failed: rows.length - removed, dryRun };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required');
  }
  if (!supabaseKey) {
    throw new Error('SUPABASE_SECRET_KEY environment variable is required');
  }

  const { createSecretClient } = await import('@campusnest/supabase/server');
  const supabase = createSecretClient() as unknown as SupabaseClient;

  const retentionDays = resolveRetentionDays(process.env.CAPTURE_RETENTION_DAYS);
  const dryRun = process.argv.includes('--dry-run');

  console.log(
    `Starting capture retention sweep (retention: ${retentionDays}d${dryRun ? ', dry-run' : ''})...`,
  );

  const summary = await sweepExpiredCaptures(supabase, { retentionDays, dryRun });

  console.log('Capture retention sweep complete:');
  console.log(`  Scanned: ${summary.scanned}`);
  console.log(`  Removed: ${summary.removed}`);
  console.log(`  Failed: ${summary.failed}`);

  // Output metrics for GitHub Actions (embed.ts precedent)
  console.log(`::cleanup-captures-metrics::${JSON.stringify(summary)}`);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

// Only run when executed directly (npx tsx …/cleanup-captures.ts) — importing
// this module in tests must not trigger the sweep.
const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error('Capture retention sweep failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
