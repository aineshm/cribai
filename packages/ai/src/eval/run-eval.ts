/**
 * PDR-004 Track A Days 5-6 (AIN-9) — eval runner.
 *
 * Replays every corpus seed through `runLlmTurn` with the REAL
 * `createAiSdkModel()` (network!), scores 4 dimensions per seed, enforces a
 * cost-ceiling budget guard, and prints a per-bucket + overall report. Run via
 * `pnpm eval` (NOT part of the unit suite — it needs live model access).
 *
 * Budget guard: CRIBAI_EVAL_COST_CEILING_USD (default $3.00). The runner sums
 * projected per-turn cost and ABORTS before the next seed if the running total
 * would exceed the ceiling — so an eval run can't quietly burn the GCP budget.
 *
 * HITL leaks are reported as a SEPARATE hard counter (not averaged into the
 * quality mean): a single leak across the corpus is a failure of the
 * zero-leaked-outreach gate.
 *
 * The scoring core (`scoreSeed`) is exported + model-injectable so a smoke test
 * can dry-run it against a recorded fixture with fake models (no network).
 */

import type { LanguageModel } from 'ai';
import {
  createEmptyConversationState,
  mergeConversationState,
  normalizeConversationState,
  type ConversationState,
} from '@campusnest/types';
import type { ChatEvent } from '../cribai';
import type { ToolContext } from '../tools/types';
import { runLlmTurn } from '../runtime/llm-turn';
import { createAiSdkModel } from '../runtime/ai-sdk-provider';
import { EMPTY_PROFILE_SNIPPET } from '../runtime/system-prompt';
import { projectTurnCost } from '../runtime/turn-cost';
import { loadCorpus } from './corpus';
import {
  scoreToolSequence,
  scoreStatePatch,
  scoreHitlIntegrity,
  scoreQuality,
} from './scorers';
import {
  EVAL_BUCKETS,
  type EvalBucket,
  type EvalResult,
  type EvalSeed,
} from './types';

const EVAL_COST_CEILING_DEFAULT = 3.0;

export function resolveEvalCostCeilingUsd(
  env: { CRIBAI_EVAL_COST_CEILING_USD?: string } = process.env,
): number {
  const raw = env.CRIBAI_EVAL_COST_CEILING_USD;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return EVAL_COST_CEILING_DEFAULT;
}

/** Build the starting conversation state for a seed's last turn. */
export function seedStartState(seed: EvalSeed): ConversationState {
  const lastTurn = seed.turns[seed.turns.length - 1]!;
  if (!lastTurn.priorState) return createEmptyConversationState();
  // Merge the partial priorState onto an empty state, then normalize so an
  // invalid partial can't crash the runner.
  const merged = mergeConversationState(
    createEmptyConversationState(),
    lastTurn.priorState as Partial<ConversationState>,
  );
  return normalizeConversationState(merged);
}

/**
 * Score a single seed from a recorded `ChatEvent[]` array + injected judge
 * model. Pure of network EXCEPT the judge model call (inject a fake offline).
 */
export async function scoreSeed(
  seed: EvalSeed,
  events: readonly ChatEvent[],
  judgeModel: LanguageModel,
): Promise<EvalResult> {
  const toolSequence = scoreToolSequence(events, seed.expected.toolSequence);
  const statePatch = scoreStatePatch(events, seed.expected.statePatch);
  const hitl = scoreHitlIntegrity(events, seed.expected.hitlPhase);
  const quality = await scoreQuality(events, seed, judgeModel);

  return {
    seedId: seed.id,
    bucket: seed.bucket,
    toolSequence,
    statePatch,
    hitlIntegrity: hitl,
    quality,
    hitlLeaked: hitl.leaked,
    qualityRubric: quality.rubric,
    needsHumanReview: quality.needsHumanReview,
  };
}

/** Drain a runLlmTurn generator into a ChatEvent array + capture turn cost. */
async function replaySeed(
  seed: EvalSeed,
  model: LanguageModel,
  toolContext: ToolContext,
): Promise<{ events: ChatEvent[]; costUsd: number }> {
  const events: ChatEvent[] = [];
  let costUsd = 0;
  const lastTurn = seed.turns[seed.turns.length - 1]!;
  const history = seed.turns.slice(0, -1).map((t) => ({
    role: 'user' as const,
    content: t.userMessage,
  }));

  for await (const event of runLlmTurn({
    model,
    query: lastTurn.userMessage,
    state: seedStartState(seed),
    profile: EMPTY_PROFILE_SNIPPET,
    toolContext,
    campusName: 'UW-Madison',
    isGuest: false,
    history,
    telemetryEnabled: false,
    onTurnCost: (cost) => {
      costUsd = cost.costUsd;
    },
  })) {
    events.push(event);
  }
  return { events, costUsd };
}

export interface BucketReport {
  readonly bucket: EvalBucket;
  readonly count: number;
  readonly toolCorrectnessPct: number;
  readonly hitlIntegrityPct: number;
  readonly meanQuality: number;
  readonly hitlLeaks: number;
}

export interface EvalReport {
  readonly results: EvalResult[];
  readonly buckets: BucketReport[];
  readonly overall: {
    readonly toolCorrectnessPct: number;
    readonly hitlIntegrityPct: number;
    readonly meanQuality: number;
    readonly hitlLeaks: number;
    readonly needsHumanReview: number;
    readonly totalCostUsd: number;
    readonly aborted: boolean;
  };
}

export function aggregateReport(
  results: EvalResult[],
  totalCostUsd: number,
  aborted: boolean,
): EvalReport {
  const pct = (xs: boolean[]): number =>
    xs.length === 0 ? 0 : (xs.filter(Boolean).length / xs.length) * 100;

  const buckets: BucketReport[] = EVAL_BUCKETS.map((bucket) => {
    const rs = results.filter((r) => r.bucket === bucket);
    return {
      bucket,
      count: rs.length,
      toolCorrectnessPct: pct(rs.map((r) => r.toolSequence.pass)),
      hitlIntegrityPct: pct(rs.map((r) => r.hitlIntegrity.pass)),
      meanQuality:
        rs.length === 0 ? 0 : rs.reduce((s, r) => s + r.qualityRubric, 0) / rs.length,
      hitlLeaks: rs.filter((r) => r.hitlLeaked).length,
    };
  }).filter((b) => b.count > 0);

  return {
    results,
    buckets,
    overall: {
      toolCorrectnessPct: pct(results.map((r) => r.toolSequence.pass)),
      hitlIntegrityPct: pct(results.map((r) => r.hitlIntegrity.pass)),
      meanQuality:
        results.length === 0
          ? 0
          : results.reduce((s, r) => s + r.qualityRubric, 0) / results.length,
      hitlLeaks: results.filter((r) => r.hitlLeaked).length,
      needsHumanReview: results.filter((r) => r.needsHumanReview).length,
      totalCostUsd,
      aborted,
    },
  };
}

export function formatReport(report: EvalReport): string {
  const lines: string[] = [];
  lines.push('=== CribAI LLM-first eval report ===');
  lines.push('');
  lines.push('Bucket            n   tool%   hitl%   quality  leaks');
  for (const b of report.buckets) {
    lines.push(
      `${b.bucket.padEnd(16)} ${String(b.count).padStart(2)}  ` +
        `${b.toolCorrectnessPct.toFixed(0).padStart(5)}  ` +
        `${b.hitlIntegrityPct.toFixed(0).padStart(5)}  ` +
        `${b.meanQuality.toFixed(2).padStart(6)}  ` +
        `${String(b.hitlLeaks).padStart(5)}`,
    );
  }
  const o = report.overall;
  lines.push('');
  lines.push(
    `OVERALL: tool-correctness ${o.toolCorrectnessPct.toFixed(1)}% | ` +
      `HITL integrity ${o.hitlIntegrityPct.toFixed(1)}% | ` +
      `mean quality ${o.meanQuality.toFixed(2)}/5`,
  );
  lines.push(
    `HITL LEAKS: ${o.hitlLeaks}${o.hitlLeaks > 0 ? '  *** ZERO-LEAK GATE FAILED ***' : '  (gate OK)'}`,
  );
  lines.push(`needs-human-review: ${o.needsHumanReview}`);
  lines.push(`total projected cost: $${o.totalCostUsd.toFixed(4)}`);
  if (o.aborted) {
    lines.push('*** RUN ABORTED — cost ceiling exceeded before completing the corpus ***');
  }
  return lines.join('\n');
}

export interface RunEvalOptions {
  readonly model: LanguageModel;
  readonly judgeModel: LanguageModel;
  readonly toolContext: ToolContext;
  readonly costCeilingUsd?: number;
}

/**
 * Replay + score the full corpus. Aborts before the next seed once the running
 * cost would exceed the ceiling. Returns the aggregated report.
 */
export async function runEval(options: RunEvalOptions): Promise<EvalReport> {
  const ceiling = options.costCeilingUsd ?? resolveEvalCostCeilingUsd();
  const seeds = loadCorpus();
  const results: EvalResult[] = [];
  let totalCostUsd = 0;
  let aborted = false;

  for (const seed of seeds) {
    if (totalCostUsd >= ceiling) {
      aborted = true;
      break;
    }
    const { events, costUsd } = await replaySeed(seed, options.model, options.toolContext);
    totalCostUsd += costUsd;
    const result = await scoreSeed(seed, events, options.judgeModel);
    results.push(result);
  }

  return aggregateReport(results, totalCostUsd, aborted);
}

// ---------------------------------------------------------------------------
// CLI entrypoint — `pnpm eval`
// ---------------------------------------------------------------------------

/**
 * Build the ToolContext for an eval run from env. Requires a Supabase
 * service-role client + campus ids — the runner exercises real tool handlers,
 * so this is intentionally explicit. Throws with guidance if unset.
 */
async function buildEvalToolContext(): Promise<ToolContext> {
  const { createSecretClient } = await import('@campusnest/supabase/server');
  const campusId = process.env.EVAL_CAMPUS_ID;
  const campusSlug = process.env.EVAL_CAMPUS_SLUG ?? 'uw-madison';
  const userId = process.env.EVAL_USER_ID;
  if (!campusId || !userId) {
    throw new Error(
      'Eval runner needs EVAL_CAMPUS_ID + EVAL_USER_ID (a seeded test user) set. ' +
        'See packages/ai/src/eval/README.md.',
    );
  }
  return {
    supabase: createSecretClient(),
    campusId,
    campusSlug,
    userId,
  };
}

async function main(): Promise<void> {
  const model = createAiSdkModel();
  // Quality judge runs on the SAME model family (separate instance) per PDR.
  const judgeModel = createAiSdkModel();
  const toolContext = await buildEvalToolContext();
  const report = await runEval({ model, judgeModel, toolContext });
  // eslint-disable-next-line no-console
  console.log(formatReport(report));
  // Non-zero exit on a HITL leak so CI fails the gate.
  if (report.overall.hitlLeaks > 0) {
    process.exitCode = 1;
  }
}

// Only run when invoked directly (not when imported by a test).
const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  /run-eval(\.[cm]?[jt]s)?$/.test(process.argv[1] ?? '');

if (isDirectRun) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[eval] run failed:', err);
    process.exitCode = 1;
  });
}

// Re-export projectTurnCost for callers that want raw cost math.
export { projectTurnCost };
