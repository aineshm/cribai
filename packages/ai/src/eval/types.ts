/**
 * PDR-004 Track A Days 5-6 (AIN-9) — eval harness types.
 *
 * The eval harness replays seeds through `runLlmTurn` with the REAL AI SDK
 * model and scores each turn on 4 dimensions (tool-sequence, state-patch, HITL
 * integrity, quality). This file is the schema shared by the corpus, the
 * scorers, and the runner.
 *
 * v1 corpus is SYNTHETIC (hand-authored from the tour-hitl E2E spec + the tool
 * registry `when_to_call` hints). The migration path to a prod-trace corpus is
 * documented in `eval/README.md` — seeds keep the same shape; only `source`
 * flips to `'prod_trace'`.
 */

import { z } from 'zod';
import type { ToolName } from '../tools/types';

/** The 6 stratification buckets from PDR-004 §Risks A8. */
export const EVAL_BUCKETS = [
  'search',
  'detail',
  'compare',
  'tour-prep',
  'tour-confirm',
  'ambiguous',
] as const;
export type EvalBucket = (typeof EVAL_BUCKETS)[number];

/** Which HITL phase a turn represents (only meaningful for HITL buckets). */
export const HITL_PHASES = ['none', 'preview', 'confirm'] as const;
export type HitlPhase = (typeof HITL_PHASES)[number];

const TOOL_NAMES: readonly ToolName[] = [
  'search_listings',
  'get_listing_detail',
  'compare_listings',
  'schedule_tour',
  'explain_lease_term',
  'get_landlord_info',
  'get_saved_listings',
  'web_search',
  'get_reviews',
  'contact_pm',
  'get_neighborhood_info',
  'create_sublease',
  'propose_mission',
];

const toolNameSchema = z.enum(TOOL_NAMES as [ToolName, ...ToolName[]]);

/**
 * One conversational turn in a seed. `userMessage` is what the student says;
 * `priorState` seeds the conversation_state the turn starts from (so a
 * tour-confirm seed can start with a `pendingAction.kind === 'tour'`).
 */
export const evalTurnSchema = z.object({
  userMessage: z.string().min(1),
  /** Conversation state the turn begins from (partial — merged onto empty). */
  priorState: z.record(z.string(), z.unknown()).optional(),
});
export type EvalTurn = z.infer<typeof evalTurnSchema>;

/** Expected outcome for the LAST turn of the seed. */
export const evalExpectationSchema = z.object({
  /** Ordered exact tool-name sequence expected this turn (may be empty). */
  toolSequence: z.array(toolNameSchema),
  /**
   * Expected merged conversation-state patch (structural subset). The
   * state-patch scorer deep-compares the merged statePatch against this.
   * Omit when the turn isn't expected to mutate state.
   */
  statePatch: z.record(z.string(), z.unknown()).optional(),
  /** HITL phase this turn represents. Drives the integrity gate. */
  hitlPhase: z.enum(HITL_PHASES),
});
export type EvalExpectation = z.infer<typeof evalExpectationSchema>;

export const evalSeedSchema = z.object({
  id: z.string().min(1),
  bucket: z.enum(EVAL_BUCKETS),
  source: z.literal('synthetic'),
  /** A short human description of what this seed exercises. */
  description: z.string().min(1),
  /** The turns to replay. Scoring is against the LAST turn. */
  turns: z.array(evalTurnSchema).min(1),
  expected: evalExpectationSchema,
});
export type EvalSeed = z.infer<typeof evalSeedSchema>;

// ---------------------------------------------------------------------------
// Scoring result types
// ---------------------------------------------------------------------------

export type DimensionName =
  | 'tool_sequence'
  | 'state_patch'
  | 'hitl_integrity'
  | 'quality';

export interface DimensionScore {
  readonly dimension: DimensionName;
  /** 0..1 for graded dims; quality is the 1-5 rubric normalized to 0..1. */
  readonly score: number;
  readonly pass: boolean;
  /** Human-readable explanation (failures especially). */
  readonly detail: string;
}

export interface EvalResult {
  readonly seedId: string;
  readonly bucket: EvalBucket;
  readonly toolSequence: DimensionScore;
  readonly statePatch: DimensionScore;
  readonly hitlIntegrity: DimensionScore;
  readonly quality: DimensionScore;
  /**
   * HARD gate: true when a side-effecting HITL tool ran with confirmed=true
   * outside a confirm-phase seed. A single leak across the whole corpus is a
   * corpus-level failure (PDR-004 "100% zero-leaked-outreach").
   */
  readonly hitlLeaked: boolean;
  /** Raw 1-5 quality rubric score (before 0..1 normalization). */
  readonly qualityRubric: number;
  /** True when quality < 3 → flagged for human review. */
  readonly needsHumanReview: boolean;
  /** FIX 5 — projected USD cost of this seed's judge-model call. */
  readonly judgeCostUsd: number;
}
