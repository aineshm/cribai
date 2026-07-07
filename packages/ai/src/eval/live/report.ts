/**
 * AIN-93 — report aggregation + formatting.
 *
 * Pass bar (the ticket's method, plan decision): a scenario passes when it
 * passes ALL hard criteria (every turn) + the run's latency budget + (if
 * judged) the soft-criteria judge in >= `PASS_BAR_RUN_THRESHOLD` of its
 * `RUNS_PER_SCENARIO` runs. The overall gate passes when
 * >= `PASS_BAR_SCENARIO_PCT` of scenarios pass that bar. Every FAILING run's
 * full transcript is included in the formatted report (ticket requirement:
 * each distinct failure becomes its own ticket).
 */
import { PASS_BAR_RUN_THRESHOLD, PASS_BAR_SCENARIO_PCT } from './config';
import type { TurnHardCheckResults } from './checks';
import type { LatencyCheckResult } from './checks/latency';

export type JudgeVerdict = 'pass' | 'fail' | 'not_judged' | 'judge_error';

export interface TurnRunResult {
  readonly query: string;
  readonly httpStatus: number;
  readonly requestId: string;
  readonly hardChecks: TurnHardCheckResults;
  readonly hardChecksPassed: boolean;
  readonly throttled: boolean;
  /**
   * Persistent network/timeout failure (CodeRabbit PR #123 fix 7), distinct
   * from `throttled` — always `false` when `throttled` is `true`. Optional
   * so pre-existing `TurnRunResult` literals (tests, fixtures) don't need to
   * be touched; undefined reads as "not a network failure".
   */
  readonly networkFailure?: boolean;
  /** Redacted assistant/tool-call excerpt for the failure report — never a raw header/token. */
  readonly transcriptExcerpt: string;
}

export interface ScenarioRunResult {
  readonly runIndex: number;
  readonly turns: readonly TurnRunResult[];
  readonly latency: LatencyCheckResult;
  readonly judgeVerdict: JudgeVerdict;
  readonly judgeReasoning: string | null;
  readonly passed: boolean;
}

export interface ScenarioReport {
  readonly scenarioId: string;
  readonly bucket: string;
  readonly runs: readonly ScenarioRunResult[];
  readonly passCount: number;
  readonly scenarioPassed: boolean;
}

export interface LiveEvalReport {
  readonly scenarios: readonly ScenarioReport[];
  readonly scenarioPassPct: number;
  readonly passBarMet: boolean;
  readonly aborted: boolean;
  readonly totalCostUsd: number;
}

/** A scenario run passes only when every turn's hard checks, the run's latency, and (if judged) the judge all pass. */
export function scenarioRunPassed(
  turns: readonly TurnRunResult[],
  latency: LatencyCheckResult,
  judgeVerdict: JudgeVerdict,
): boolean {
  const allTurnsPassed = turns.every((t) => t.hardChecksPassed);
  const judgeOk = judgeVerdict === 'pass' || judgeVerdict === 'not_judged';
  return allTurnsPassed && latency.pass && judgeOk;
}

export function buildScenarioReport(
  scenarioId: string,
  bucket: string,
  runs: readonly ScenarioRunResult[],
): ScenarioReport {
  const passCount = runs.filter((r) => r.passed).length;
  return {
    scenarioId,
    bucket,
    runs,
    passCount,
    scenarioPassed: passCount >= PASS_BAR_RUN_THRESHOLD,
  };
}

export function aggregateLiveReport(
  scenarios: readonly ScenarioReport[],
  totalCostUsd: number,
  aborted: boolean,
): LiveEvalReport {
  const passing = scenarios.filter((s) => s.scenarioPassed).length;
  const scenarioPassPct = scenarios.length === 0 ? 0 : passing / scenarios.length;
  return {
    scenarios,
    scenarioPassPct,
    passBarMet: scenarioPassPct >= PASS_BAR_SCENARIO_PCT,
    aborted,
    totalCostUsd,
  };
}

function runVerdictLabel(run: ScenarioRunResult | undefined): string {
  if (!run) return '—';
  if (run.passed) return 'PASS';
  if (run.turns.some((t) => t.throttled)) return 'THROTTLED';
  if (run.turns.some((t) => t.networkFailure)) return 'NETWORK_FAIL';
  return 'FAIL';
}

function formatFailingRun(scenario: ScenarioReport, run: ScenarioRunResult): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`### ${scenario.scenarioId} — run ${run.runIndex + 1}`);
  for (const turn of run.turns) {
    lines.push(`- query: ${JSON.stringify(turn.query)}`);
    const statusSuffix = turn.throttled ? ' (THROTTLED)' : turn.networkFailure ? ' (NETWORK_FAIL)' : '';
    lines.push(`  http: ${turn.httpStatus}${statusSuffix}`);
    for (const [name, check] of Object.entries(turn.hardChecks)) {
      lines.push(`  - ${name}: ${check.pass ? 'pass' : 'FAIL'} — ${check.detail}`);
    }
    if (turn.transcriptExcerpt) lines.push(`  transcript: ${turn.transcriptExcerpt}`);
  }
  lines.push(`  latency: ${run.latency.detail}`);
  if (run.judgeReasoning) lines.push(`  judge (${run.judgeVerdict}): ${run.judgeReasoning}`);
  return lines;
}

export function formatLiveReport(report: LiveEvalReport): string {
  const lines: string[] = [];
  lines.push('# AIN-93 Live Conversation-Quality Report');
  lines.push('');
  lines.push(
    `Pass bar: >=${(PASS_BAR_SCENARIO_PCT * 100).toFixed(0)}% of scenarios passing ` +
      `>=${PASS_BAR_RUN_THRESHOLD}/3 runs. Observed: ${(report.scenarioPassPct * 100).toFixed(1)}% ` +
      `— ${report.passBarMet ? 'PASS' : 'FAIL'}`,
  );
  if (report.aborted) {
    lines.push('');
    lines.push('**RUN ABORTED — cost ceiling exceeded before completing the corpus.**');
  }
  lines.push('');
  lines.push('| Scenario | Bucket | Run 1 | Run 2 | Run 3 | Verdict |');
  lines.push('|---|---|---|---|---|---|');
  for (const scenario of report.scenarios) {
    const cells = [0, 1, 2].map((i) => runVerdictLabel(scenario.runs[i]));
    lines.push(
      `| ${scenario.scenarioId} | ${scenario.bucket} | ${cells[0]} | ${cells[1]} | ${cells[2]} | ${
        scenario.scenarioPassed ? 'PASS' : 'FAIL'
      } |`,
    );
  }
  lines.push('');
  lines.push(`Total projected judge/turn cost: $${report.totalCostUsd.toFixed(4)}`);

  const failingRuns = report.scenarios.flatMap((scenario) =>
    scenario.runs.filter((run) => !run.passed).map((run) => ({ scenario, run })),
  );
  if (failingRuns.length > 0) {
    lines.push('');
    lines.push('## Failure transcripts');
    for (const { scenario, run } of failingRuns) {
      lines.push(...formatFailingRun(scenario, run));
    }
  }

  return lines.join('\n');
}
