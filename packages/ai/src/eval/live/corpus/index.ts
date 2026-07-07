/**
 * AIN-93 live-eval harness — golden scenario corpus loader.
 *
 * 20 hand-authored scenarios, 2 per bucket, one JSON file per bucket
 * (mirrors `../corpus/index.ts`'s static-import + Zod-validate-at-load
 * pattern for the in-process eval). A malformed scenario fails loudly at
 * load — never silently dropped.
 */
import { liveScenarioSchema, LIVE_EVAL_BUCKETS, type LiveScenario, type LiveEvalBucket } from './schema';

import pickForMe from './scenarios/pick-for-me.json';
import priceFairness from './scenarios/price-fairness.json';
import budgetConstrainedCompare from './scenarios/budget-constrained-compare.json';
import whatToAskLandlord from './scenarios/what-to-ask-landlord.json';
import justSavedFollowup from './scenarios/just-saved-followup.json';
import ambiguousClarify from './scenarios/ambiguous-clarify.json';
import floorPlanQuestions from './scenarios/floor-plan-questions.json';
import archivedExclusion from './scenarios/archived-exclusion.json';
import unknownListing from './scenarios/unknown-listing.json';
import plainInfoAsk from './scenarios/plain-info-ask.json';

const RAW_SCENARIOS: readonly unknown[] = [
  ...pickForMe,
  ...priceFairness,
  ...budgetConstrainedCompare,
  ...whatToAskLandlord,
  ...justSavedFollowup,
  ...ambiguousClarify,
  ...floorPlanQuestions,
  ...archivedExclusion,
  ...unknownListing,
  ...plainInfoAsk,
];

/** Load + validate the full corpus. Throws (with the index) on any malformed scenario. */
export function loadLiveCorpus(): LiveScenario[] {
  return RAW_SCENARIOS.map((raw, i) => {
    const parsed = liveScenarioSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`AIN-93 live corpus scenario #${i} is invalid: ${parsed.error.message}`);
    }
    return parsed.data;
  });
}

export function liveCorpusByBucket(): Record<LiveEvalBucket, LiveScenario[]> {
  const scenarios = loadLiveCorpus();
  const grouped = {} as Record<LiveEvalBucket, LiveScenario[]>;
  for (const bucket of LIVE_EVAL_BUCKETS) grouped[bucket] = [];
  for (const scenario of scenarios) grouped[scenario.bucket]!.push(scenario);
  return grouped;
}

export { LIVE_EVAL_BUCKETS, liveScenarioSchema } from './schema';
export type { LiveScenario, LiveEvalBucket, LiveTurn, LiveTurnExpectation } from './schema';
