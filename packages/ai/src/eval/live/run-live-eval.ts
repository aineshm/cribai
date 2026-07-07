/**
 * AIN-93 live-eval harness — the runner (Task 6).
 *
 * `runLiveEval` is the pure-ish orchestration core: every external effect
 * (HTTP, DB, judge, sleep) is injected, so the unit suite can dry-run it
 * with a mocked `fetch` and fake DB/judge callbacks — NO live network calls.
 * `main()` wires the real implementations and is the `pnpm eval:live` entry
 * point (recon fact 1-8 / plan decisions 1-9):
 *
 *   1. probe turn — confirm the CRM surface is on the LLM-first runtime.
 *   2. seed check — resolve the 8 fixed truth-table rows to real DB ids
 *      (throws with guidance if the fixture hasn't been seeded).
 *   3. run the 20-scenario corpus, 3x each, with pacing + throttle retry.
 *   4. print the report; non-zero exit when the pass bar isn't met.
 */
import { randomUUID } from 'node:crypto';
import { postTurn, type HistoryTurn, type TurnResult } from './http-turn';
import { postTurnWithThrottleRetry } from './retry';
import { probeRuntime } from './probe';
import { extractAssistantText } from '../scorers';
import { toChatEvents } from './checks/types';
import { runTurnHardChecks, turnPassedHardChecks } from './checks';
import { checkLatency, type LatencyMetricsRow } from './checks/latency';
import { judgeConversation, type JudgeRubric } from './judge';
import { loadLiveCorpus, type LiveScenario } from './corpus';
import { SEED_LISTING_KEYS, SEED_LISTINGS, type SeedListingKey, type SeedListingTruth } from './seed-truth';
import {
  resolveTargetConfig,
  resolveLiveCostCeilingUsd,
  resolveCampusSlug,
  MIN_TURN_SPACING_MS,
  MAX_THROTTLE_RETRIES,
  THROTTLE_BACKOFF_BASE_MS,
  LATENCY_TOTAL_P95_BUDGET_MS,
  LATENCY_TTFT_P95_BUDGET_MS,
  RUNS_PER_SCENARIO,
} from './config';
import {
  scenarioRunPassed,
  buildScenarioReport,
  aggregateLiveReport,
  formatLiveReport,
  type TurnRunResult,
  type ScenarioRunResult,
  type ScenarioReport,
  type LiveEvalReport,
  type JudgeVerdict,
} from './report';

/**
 * Flat per-call estimate for the judge's structured-generation cost.
 * `defaultCrmGenerate` doesn't surface token usage the way the in-process
 * eval's `generateText` judge does (see `scorers.ts`'s `projectTurnCost`
 * call), so the ceiling here is a documented approximation, not an exact
 * accounting — it exists to stop a runaway loop of judge calls, not to
 * reconcile against a billing statement.
 */
const ESTIMATED_JUDGE_CALL_COST_USD = 0.02;

async function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RunLiveEvalDeps {
  readonly scenarios: readonly LiveScenario[];
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly campusSlug: string;
  readonly seedIdsByKey: Readonly<Record<SeedListingKey, string>>;
  readonly fetchLatencyRow: (requestId: string) => Promise<LatencyMetricsRow | null>;
  readonly judge?: (input: {
    readonly scenarioId: string;
    readonly scenarioDescription: string;
    readonly transcriptText: string;
  }) => Promise<JudgeRubric>;
  readonly createConversation: () => Promise<string>;
  readonly deleteConversation: (id: string) => Promise<void>;
  readonly deleteCreatedListings: (ids: readonly string[]) => Promise<void>;
  readonly fetchImpl?: typeof fetch;
  readonly sleepFn?: (ms: number) => Promise<void>;
  readonly runsPerScenario?: number;
  readonly costCeilingUsd?: number;
  readonly totalBudgetMs?: number;
  readonly ttftBudgetMs?: number;
  readonly minTurnSpacingMs?: number;
  readonly maxThrottleRetries?: number;
  readonly throttleBackoffBaseMs?: number;
}

function extractNewlyCreatedListingId(event: TurnResult['events'][number]): string | null {
  if (event.type !== 'tool_result' || event.name !== 'add_listing') return null;
  const md = event.machineData as { listing?: { id?: unknown } } | undefined;
  const id = md?.listing?.id;
  return typeof id === 'string' ? id : null;
}

async function runOneTurn(args: {
  readonly turn: LiveScenario['turns'][number];
  readonly conversationId: string;
  readonly history: HistoryTurn[];
  readonly knownIds: Set<string>;
  readonly truthByListingId: ReadonlyMap<string, SeedListingTruth>;
  readonly deps: RunLiveEvalDeps;
  readonly fetchImpl: typeof fetch;
  readonly sleepFn: (ms: number) => Promise<void>;
  readonly minTurnSpacingMs: number;
  readonly maxThrottleRetries: number;
  readonly throttleBackoffBaseMs: number;
}): Promise<{ turnResult: TurnRunResult; throttled: boolean; assistantText: string; createdIds: string[] }> {
  const { turn, conversationId, history, knownIds, truthByListingId, deps } = args;
  await args.sleepFn(args.minTurnSpacingMs);

  const requestId = randomUUID();
  const { result, throttled } = await postTurnWithThrottleRetry({
    maxRetries: args.maxThrottleRetries,
    backoffBaseMs: args.throttleBackoffBaseMs,
    sleepFn: args.sleepFn,
    postTurnFn: () =>
      postTurn({
        baseUrl: deps.baseUrl,
        accessToken: deps.accessToken,
        query: turn.query,
        campusSlug: deps.campusSlug,
        conversationId,
        history,
        requestId,
        fetchImpl: args.fetchImpl,
      }),
  });

  const createdIds: string[] = [];
  for (const event of result.events) {
    const newId = extractNewlyCreatedListingId(event);
    if (newId) {
      knownIds.add(newId);
      createdIds.push(newId);
    }
  }

  const hardChecks = runTurnHardChecks({
    events: result.events,
    httpStatus: result.httpStatus,
    expectedTools: turn.expect.tool,
    forbiddenTools: turn.expect.forbiddenTools,
    knownIds,
    groundingMode: turn.expect.grounding,
    truthByListingId,
    expectedShowCard: turn.expect.show_card,
  });

  const assistantText = extractAssistantText(toChatEvents(result.events));

  const turnResult: TurnRunResult = {
    query: turn.query,
    httpStatus: result.httpStatus,
    requestId,
    hardChecks,
    hardChecksPassed: turnPassedHardChecks(hardChecks),
    throttled,
    transcriptExcerpt: assistantText.slice(0, 500),
  };

  return { turnResult, throttled, assistantText, createdIds };
}

async function runOneScenarioRun(
  scenario: LiveScenario,
  runIndex: number,
  ctx: {
    readonly baseKnownIds: ReadonlySet<string>;
    readonly truthByListingId: ReadonlyMap<string, SeedListingTruth>;
    readonly deps: RunLiveEvalDeps;
    readonly fetchImpl: typeof fetch;
    readonly sleepFn: (ms: number) => Promise<void>;
    readonly minTurnSpacingMs: number;
    readonly maxThrottleRetries: number;
    readonly throttleBackoffBaseMs: number;
    readonly totalBudgetMs: number;
    readonly ttftBudgetMs: number;
  },
): Promise<{ run: ScenarioRunResult; judgeCostUsd: number }> {
  const conversationId = await ctx.deps.createConversation();
  const knownIds = new Set(ctx.baseKnownIds);
  const createdListingIds: string[] = [];
  const turns: TurnRunResult[] = [];
  const latencyRows: LatencyMetricsRow[] = [];
  const transcriptParts: string[] = [];
  const history: HistoryTurn[] = [];
  let throttledTurnCount = 0;

  for (const turn of scenario.turns) {
    const { turnResult, throttled, assistantText, createdIds } = await runOneTurn({
      turn,
      conversationId,
      history,
      knownIds,
      truthByListingId: ctx.truthByListingId,
      deps: ctx.deps,
      fetchImpl: ctx.fetchImpl,
      sleepFn: ctx.sleepFn,
      minTurnSpacingMs: ctx.minTurnSpacingMs,
      maxThrottleRetries: ctx.maxThrottleRetries,
      throttleBackoffBaseMs: ctx.throttleBackoffBaseMs,
    });

    if (throttled) throttledTurnCount += 1;
    createdListingIds.push(...createdIds);
    turns.push(turnResult);
    transcriptParts.push(`user: ${turn.query}\nassistant: ${assistantText}`);
    history.push({ role: 'user', content: turn.query });
    history.push({ role: 'assistant', content: assistantText });

    const latencyRow = await ctx.deps.fetchLatencyRow(turnResult.requestId);
    if (latencyRow) latencyRows.push(latencyRow);
  }

  const latency = checkLatency({
    rows: latencyRows,
    totalBudgetMs: ctx.totalBudgetMs,
    ttftBudgetMs: ctx.ttftBudgetMs,
    throttledTurnCount,
  });

  const needsJudge = scenario.turns.some((t) => t.expect.judge);
  let judgeVerdict: JudgeVerdict = 'not_judged';
  let judgeReasoning: string | null = null;
  let judgeCostUsd = 0;

  if (needsJudge) {
    const judgeFn = ctx.deps.judge ?? judgeConversation;
    try {
      const rubric = await judgeFn({
        scenarioId: scenario.id,
        scenarioDescription: scenario.description,
        transcriptText: transcriptParts.join('\n\n'),
      });
      judgeVerdict = rubric.verdict;
      judgeReasoning = rubric.reasoning;
      judgeCostUsd = ESTIMATED_JUDGE_CALL_COST_USD;
    } catch (err) {
      judgeVerdict = 'judge_error';
      judgeReasoning = err instanceof Error ? err.message : String(err);
    }
  }

  const passed = scenarioRunPassed(turns, latency, judgeVerdict);

  await ctx.deps.deleteConversation(conversationId);
  if (createdListingIds.length > 0) await ctx.deps.deleteCreatedListings(createdListingIds);

  return {
    run: { runIndex, turns, latency, judgeVerdict, judgeReasoning, passed },
    judgeCostUsd,
  };
}

/** Would running the next judge-bearing scenario run exceed the cost ceiling? */
function wouldExceedCeiling(scenario: LiveScenario, totalCostUsd: number, ceiling: number): boolean {
  const needsJudge = scenario.turns.some((t) => t.expect.judge);
  return needsJudge && totalCostUsd + ESTIMATED_JUDGE_CALL_COST_USD > ceiling;
}

export async function runLiveEval(deps: RunLiveEvalDeps): Promise<LiveEvalReport> {
  const runsPerScenario = deps.runsPerScenario ?? RUNS_PER_SCENARIO;
  const costCeilingUsd = deps.costCeilingUsd ?? resolveLiveCostCeilingUsd();
  const ctx = {
    baseKnownIds: new Set(
      (Object.entries(deps.seedIdsByKey) as [SeedListingKey, string][])
        .filter(([key]) => key !== 'archived')
        .map(([, id]) => id),
    ),
    truthByListingId: new Map(
      SEED_LISTING_KEYS.map((key) => [deps.seedIdsByKey[key], SEED_LISTINGS[key]] as const),
    ),
    deps,
    fetchImpl: deps.fetchImpl ?? fetch,
    sleepFn: deps.sleepFn ?? defaultSleep,
    minTurnSpacingMs: deps.minTurnSpacingMs ?? MIN_TURN_SPACING_MS,
    maxThrottleRetries: deps.maxThrottleRetries ?? MAX_THROTTLE_RETRIES,
    throttleBackoffBaseMs: deps.throttleBackoffBaseMs ?? THROTTLE_BACKOFF_BASE_MS,
    totalBudgetMs: deps.totalBudgetMs ?? LATENCY_TOTAL_P95_BUDGET_MS,
    ttftBudgetMs: deps.ttftBudgetMs ?? LATENCY_TTFT_P95_BUDGET_MS,
  };

  let totalCostUsd = 0;
  let aborted = false;
  const scenarioReports: ScenarioReport[] = [];

  for (const scenario of deps.scenarios) {
    if (wouldExceedCeiling(scenario, totalCostUsd, costCeilingUsd)) {
      aborted = true;
      break;
    }

    const runs: ScenarioRunResult[] = [];
    for (let runIndex = 0; runIndex < runsPerScenario; runIndex++) {
      const { run, judgeCostUsd } = await runOneScenarioRun(scenario, runIndex, ctx);
      totalCostUsd += judgeCostUsd;
      runs.push(run);
    }
    scenarioReports.push(buildScenarioReport(scenario.id, scenario.bucket, runs));
  }

  return aggregateLiveReport(scenarioReports, totalCostUsd, aborted);
}

// ---------------------------------------------------------------------------
// CLI entry — `pnpm eval:live`
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const target = resolveTargetConfig();
  const campusSlug = resolveCampusSlug();

  const { provisionAndSignInTestUser } = await import('./auth');
  const { createSecretClient } = await import('@campusnest/supabase/server');
  const { resolveSeedListingIds, deleteCrmListingsByIds } = await import('./seed-cli');
  const { createConversationRow, deleteConversationRow } = await import('./conversation');

  const supabase = createSecretClient();
  const user = await provisionAndSignInTestUser();

  // Preflight 1: the 8 fixed truth rows must already be seeded.
  const seedIdsByKey = await resolveSeedListingIds(supabase, user.id);

  // Preflight 2: the CRM surface must be on the LLM-first runtime.
  await probeRuntime({
    postProbeTurn: () =>
      postTurn({
        baseUrl: target.baseUrl,
        accessToken: user.accessToken,
        query: 'hello',
        campusSlug,
      }),
    fetchRuntimeForRequestId: async (requestId) => {
      const { data } = await supabase
        .from('ai_request_metrics')
        .select('runtime')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as { runtime?: string } | null)?.runtime ?? null;
    },
  });

  const report = await runLiveEval({
    scenarios: loadLiveCorpus(),
    baseUrl: target.baseUrl,
    accessToken: user.accessToken,
    campusSlug,
    seedIdsByKey,
    fetchLatencyRow: async (requestId) => {
      const { data } = await supabase
        .from('ai_request_metrics')
        .select('request_id, request_received_at, first_model_token_at, request_completed_at')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const row = data as {
        request_id: string;
        request_received_at: string;
        first_model_token_at: string | null;
        request_completed_at: string;
      };
      return {
        requestId: row.request_id,
        requestReceivedAt: row.request_received_at,
        firstModelTokenAt: row.first_model_token_at,
        requestCompletedAt: row.request_completed_at,
      };
    },
    createConversation: () => createConversationRow(supabase, { userId: user.id }),
    deleteConversation: (id) => deleteConversationRow(supabase, id),
    deleteCreatedListings: (ids) => deleteCrmListingsByIds(supabase, ids),
  });

  // eslint-disable-next-line no-console
  console.log(formatLiveReport(report));

  if (!report.passBarMet) {
    process.exitCode = 1;
  }
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  /run-live-eval(\.[cm]?[jt]s)?$/.test(process.argv[1] ?? '');

if (isDirectRun) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[ain93 eval:live] run failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
