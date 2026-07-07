/**
 * AIN-93 hard check — latency, computed from `ai_request_metrics` rows
 * joined by the harness's self-generated `x-request-id` per turn (recon
 * fact 4). Per plan decision 6, latency GATES at the scenario-run level
 * (p95 across all turns in the run), not per-turn — a single-turn spike
 * shouldn't fail an otherwise-correct scenario; it's flagged, not failed,
 * unless the whole run's p95 breaches budget.
 *
 * A persistent throttle (429/quota exhausted after retries — decision 8) is
 * reported as a DISTINCT `throttled` flag rather than folded into a latency
 * failure, so the report can tell "prod was slow" apart from "the harness
 * got rate-limited".
 */
import type { CheckResult } from './types';

export interface LatencyMetricsRow {
  readonly requestId: string;
  readonly requestReceivedAt: string;
  readonly firstModelTokenAt: string | null;
  readonly requestCompletedAt: string;
}

export interface LatencyCheckInput {
  readonly rows: readonly LatencyMetricsRow[];
  readonly totalBudgetMs: number;
  readonly ttftBudgetMs: number;
  /** Turns in this run that hit a persistent throttle (decision 8). */
  readonly throttledTurnCount?: number;
}

export interface LatencyCheckResult extends CheckResult {
  readonly totalP95Ms: number | null;
  readonly ttftP95Ms: number | null;
  readonly throttled: boolean;
}

/** Nearest-rank p95 (ceil(0.95 * n) - 1, clamped). `null` on an empty input. */
export function computeP95(valuesMs: readonly number[]): number | null {
  if (valuesMs.length === 0) return null;
  const sorted = [...valuesMs].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return sorted[index]!;
}

function elapsedMs(fromIso: string, toIso: string): number {
  return new Date(toIso).getTime() - new Date(fromIso).getTime();
}

export function checkLatency(input: LatencyCheckInput): LatencyCheckResult {
  const throttled = (input.throttledTurnCount ?? 0) > 0;

  const totalMs = input.rows.map((r) => elapsedMs(r.requestReceivedAt, r.requestCompletedAt));
  const ttftMs = input.rows
    .filter((r): r is LatencyMetricsRow & { firstModelTokenAt: string } => r.firstModelTokenAt !== null)
    .map((r) => elapsedMs(r.requestReceivedAt, r.firstModelTokenAt));

  const totalP95Ms = computeP95(totalMs);
  const ttftP95Ms = computeP95(ttftMs);

  const totalOk = totalP95Ms === null || totalP95Ms <= input.totalBudgetMs;
  const ttftOk = ttftP95Ms === null || ttftP95Ms <= input.ttftBudgetMs;
  const pass = totalOk && ttftOk;

  const throttleNote = throttled
    ? ` (${input.throttledTurnCount} turn(s) throttled — labeled separately, not counted as a latency failure)`
    : '';

  return {
    name: 'latency',
    pass,
    detail:
      `total p95=${totalP95Ms ?? 'n/a'}ms (budget ${input.totalBudgetMs}ms), ` +
      `ttft p95=${ttftP95Ms ?? 'n/a'}ms (budget ${input.ttftBudgetMs}ms)${throttleNote}`,
    totalP95Ms,
    ttftP95Ms,
    throttled,
  };
}
