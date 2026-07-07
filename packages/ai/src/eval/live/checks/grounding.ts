/**
 * AIN-93 hard check — grounding. Diffs every rent/bedrooms/bathrooms/sqft
 * value in `machineData` against the seeded DB truth table (`seed-truth.ts`).
 * Any mismatch is a deterministic failure — prose-level numeric claims are
 * the JUDGE's job (soft); `machineData` is exact (hard), per plan decision 6.
 *
 * Two modes (scenario-declared, `corpus` schema's `expect.grounding`):
 *   - `'ranked_ids'`  — every ranked/compared listingId must be a KNOWN id
 *     (one of the 8 seeded rows). No raw-field diff (a `rank`-mode result
 *     carries only a computed score, nothing to diff against truth).
 *   - `'listing_fields'` — same id check, PLUS an exact numeric diff for
 *     every row/listing this turn's machineData can be matched to truth by
 *     id. A row whose id has NO truth match (e.g. a freshly `add_listing`-ed
 *     row from a just-saved scenario) is skipped, not failed — there is no
 *     truth for a row created during the run itself.
 *   - `'none'` — vacuous pass (the turn isn't expected to ground anything).
 */
import type { SeedListingTruth } from '../seed-truth';
import type { LiveSseEvent } from '../http-turn';
import { collectMachineData } from './machine-data';
import type { CheckResult } from './types';

export type GroundingMode = 'ranked_ids' | 'listing_fields' | 'none';

export interface GroundingInput {
  readonly events: readonly LiveSseEvent[];
  readonly mode: GroundingMode;
  readonly truthByListingId: ReadonlyMap<string, SeedListingTruth>;
}

interface ListingLikeRecord {
  readonly listingId: string;
  /**
   * `rank_compare` only ever operates over the user's PREVIOUSLY saved
   * listings — every id it returns must be a known truth id, in EVERY
   * grounding mode. `add_listing` legitimately mints a brand-new id (the
   * just-saved scenario), so a missing truth match there is expected, not a
   * failure.
   */
  readonly source: 'rank_compare' | 'add_listing';
  readonly rent?: number | null;
  readonly bedrooms?: number | null;
  readonly bathrooms?: number | null;
  readonly sqft?: number | null;
}

function extractListingLikeRecords(
  events: readonly LiveSseEvent[],
): readonly ListingLikeRecord[] {
  const records: ListingLikeRecord[] = [];
  for (const md of collectMachineData(events)) {
    if (md.kind === 'rank_compare') {
      if (md.result.mode === 'compare') {
        for (const row of md.result.rows) {
          records.push({
            listingId: row.listingId,
            source: 'rank_compare',
            rent: row.rent,
            bedrooms: row.bedrooms,
            bathrooms: row.bathrooms,
            sqft: row.sqft,
          });
        }
      } else {
        for (const ranked of md.result.ranked) {
          records.push({ listingId: ranked.listingId, source: 'rank_compare' });
        }
      }
    } else if (md.kind === 'add_listing' && md.listing) {
      records.push({
        listingId: md.listing.id,
        source: 'add_listing',
        rent: md.listing.rent,
        bedrooms: md.listing.bedrooms,
        bathrooms: md.listing.bathrooms,
        sqft: md.listing.sqft,
      });
    }
  }
  return records;
}

const NUMERIC_FIELDS = ['rent', 'bedrooms', 'bathrooms', 'sqft'] as const;

function diffAgainstTruth(record: ListingLikeRecord, truth: SeedListingTruth): readonly string[] {
  const mismatches: string[] = [];
  for (const field of NUMERIC_FIELDS) {
    const actual = record[field] ?? null;
    const expected = truth[field];
    if (actual !== expected) {
      mismatches.push(`${truth.key}.${field}: expected ${expected}, got ${actual}`);
    }
  }
  return mismatches;
}

export function checkGrounding(input: GroundingInput): CheckResult {
  if (input.mode === 'none') {
    return { name: 'grounding', pass: true, detail: 'no grounding expectation for this turn' };
  }

  const records = extractListingLikeRecords(input.events);
  if (records.length === 0) {
    return {
      name: 'grounding',
      pass: false,
      detail: `grounding=${input.mode} expected but no groundable machineData was emitted`,
    };
  }

  const mismatches: string[] = [];
  for (const record of records) {
    const truth = input.truthByListingId.get(record.listingId);
    if (!truth) {
      if (record.source === 'add_listing') {
        // Expected — a row minted during THIS run has no pre-seeded truth.
        continue;
      }
      mismatches.push(`unknown listingId in ${record.source} result: ${record.listingId}`);
      continue;
    }
    if (input.mode === 'listing_fields') {
      mismatches.push(...diffAgainstTruth(record, truth));
    }
  }

  const pass = mismatches.length === 0;
  return {
    name: 'grounding',
    pass,
    detail: pass
      ? `grounding (${input.mode}) verified against seed truth for ${records.length} record(s)`
      : mismatches.join('; '),
  };
}
