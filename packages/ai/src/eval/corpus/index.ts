/**
 * PDR-004 Track A Days 5-6 (AIN-9) — synthetic eval corpus loader.
 *
 * 30 hand-authored seeds, 5 per bucket (search / detail / compare / tour-prep /
 * tour-confirm / ambiguous), derived from the tour-hitl E2E spec and the tool
 * registry `when_to_call` hints. Each seed is a JSON file in this directory;
 * we import + Zod-validate them so a malformed seed fails loudly at load.
 *
 * Migration path (see eval/README.md): when prod traces are captured, add
 * seeds with `source: 'prod_trace'` (extend the schema) — the runner + scorers
 * are corpus-source-agnostic.
 */

import { evalSeedSchema, type EvalSeed, type EvalBucket } from '../types';

// Static imports so the corpus bundles cleanly (no fs/glob at runtime).
import search01 from './search-01.json';
import search02 from './search-02.json';
import search03 from './search-03.json';
import search04 from './search-04.json';
import search05 from './search-05.json';
import detail01 from './detail-01.json';
import detail02 from './detail-02.json';
import detail03 from './detail-03.json';
import detail04 from './detail-04.json';
import detail05 from './detail-05.json';
import compare01 from './compare-01.json';
import compare02 from './compare-02.json';
import compare03 from './compare-03.json';
import compare04 from './compare-04.json';
import compare05 from './compare-05.json';
import tourPrep01 from './tour-prep-01.json';
import tourPrep02 from './tour-prep-02.json';
import tourPrep03 from './tour-prep-03.json';
import tourPrep04 from './tour-prep-04.json';
import tourPrep05 from './tour-prep-05.json';
import tourConfirm01 from './tour-confirm-01.json';
import tourConfirm02 from './tour-confirm-02.json';
import tourConfirm03 from './tour-confirm-03.json';
import tourConfirm04 from './tour-confirm-04.json';
import tourConfirm05 from './tour-confirm-05.json';
import ambiguous01 from './ambiguous-01.json';
import ambiguous02 from './ambiguous-02.json';
import ambiguous03 from './ambiguous-03.json';
import ambiguous04 from './ambiguous-04.json';
import ambiguous05 from './ambiguous-05.json';

const RAW_SEEDS: unknown[] = [
  search01, search02, search03, search04, search05,
  detail01, detail02, detail03, detail04, detail05,
  compare01, compare02, compare03, compare04, compare05,
  tourPrep01, tourPrep02, tourPrep03, tourPrep04, tourPrep05,
  tourConfirm01, tourConfirm02, tourConfirm03, tourConfirm04, tourConfirm05,
  ambiguous01, ambiguous02, ambiguous03, ambiguous04, ambiguous05,
];

/**
 * Load + validate the full corpus. Throws (with the seed index) if any seed is
 * schema-invalid — load failures must be loud.
 */
export function loadCorpus(): EvalSeed[] {
  return RAW_SEEDS.map((raw, i) => {
    const parsed = evalSeedSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Eval corpus seed #${i} is invalid: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  });
}

/** Group the corpus by bucket. */
export function corpusByBucket(): Record<EvalBucket, EvalSeed[]> {
  const seeds = loadCorpus();
  const grouped = {} as Record<EvalBucket, EvalSeed[]>;
  for (const seed of seeds) {
    (grouped[seed.bucket] ??= []).push(seed);
  }
  return grouped;
}
