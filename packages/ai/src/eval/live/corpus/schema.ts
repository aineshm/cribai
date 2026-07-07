/**
 * AIN-93 live-eval harness — golden-scenario corpus schema (plan decision 5).
 *
 * Extends the in-process eval's seed shape (`../types.ts`'s `evalSeedSchema`)
 * with the fields THIS harness needs: an ordered `expect.tool` sequence, an
 * optional `show_card` contract, a `grounding` mode (`checks/grounding.ts`),
 * and a `judge` flag gating the soft-criteria LLM judge. `seedRefs` names
 * which of the 8 fixed truth-table rows (`../seed-truth.ts`) this scenario's
 * turns are about — the runner resolves these to real DB ids at run time,
 * never a hardcoded id.
 */
import { z } from 'zod';
import { SEED_LISTING_KEYS } from '../seed-truth';

const seedListingKeySchema = z.enum([...SEED_LISTING_KEYS] as [string, ...string[]]);

export const LIVE_EVAL_BUCKETS = [
  'pick_for_me',
  'price_fairness',
  'budget_constrained_compare',
  'what_to_ask_landlord',
  'just_saved_followup',
  'ambiguous_clarify',
  'floor_plan_questions',
  'archived_exclusion',
  'unknown_listing',
  'plain_info_ask',
] as const;
export type LiveEvalBucket = (typeof LIVE_EVAL_BUCKETS)[number];

const GROUNDING_MODES = ['ranked_ids', 'listing_fields', 'none'] as const;
export type GroundingModeName = (typeof GROUNDING_MODES)[number];

export const liveTurnExpectationSchema = z.object({
  /**
   * Required tool names that must appear, in this relative order, within the
   * turn's actual tool-call sequence (subsequence/containment match — extra
   * tools are always allowed and never fail the check; see
   * `checks/tool-expectation.ts`). Empty = no requirement.
   */
  tool: z.array(z.string()).default([]),
  /** Tool names that must never appear this turn, regardless of `tool`. Absent = no forbidden-tool constraint. */
  forbiddenTools: z.array(z.string()).optional(),
  /** The `show_card` contract for this turn's machineData, if any CRM tool fires. */
  show_card: z.boolean().optional(),
  grounding: z.enum(GROUNDING_MODES).default('none'),
  /** Whether this turn's transcript should go through the soft-criteria judge. */
  judge: z.boolean().default(false),
});
export type LiveTurnExpectation = z.infer<typeof liveTurnExpectationSchema>;

export const liveTurnSchema = z.object({
  query: z.string().min(1),
  expect: liveTurnExpectationSchema,
});
export type LiveTurn = z.infer<typeof liveTurnSchema>;

export const liveScenarioSchema = z.object({
  id: z.string().min(1),
  bucket: z.enum(LIVE_EVAL_BUCKETS),
  description: z.string().min(1),
  /** Seed keys this scenario's turns reference — resolved to real ids at run time. */
  seedRefs: z.array(seedListingKeySchema).default([]),
  turns: z.array(liveTurnSchema).min(1).max(4),
});
export type LiveScenario = z.infer<typeof liveScenarioSchema>;
