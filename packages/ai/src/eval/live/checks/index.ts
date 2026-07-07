/**
 * AIN-93 — hard-criteria checkers barrel + per-turn aggregator.
 *
 * Latency is intentionally NOT part of `runTurnHardChecks` — it gates at the
 * scenario-RUN level (see `latency.ts`'s header), so the runner (Task 6)
 * calls `checkLatency` once per run over all its turns' metrics rows.
 */
import type { SeedListingTruth } from '../seed-truth';
import type { LiveSseEvent } from '../http-turn';
import { checkNoErrors } from './errors';
import { checkToolExpectation } from './tool-expectation';
import { checkNoFabricatedIds } from './fabricated-ids';
import { checkGrounding, type GroundingMode } from './grounding';
import { checkShowCard } from './show-card';
import type { CheckResult } from './types';

export { checkNoErrors, ERROR_TEXT_PATTERN } from './errors';
export { checkToolExpectation } from './tool-expectation';
export { checkNoFabricatedIds } from './fabricated-ids';
export { checkGrounding, type GroundingMode } from './grounding';
export { checkShowCard } from './show-card';
export { checkLatency, computeP95 } from './latency';
export type { LatencyCheckInput, LatencyCheckResult, LatencyMetricsRow } from './latency';
export { collectMachineData } from './machine-data';
export type { CheckResult } from './types';

export interface TurnHardCheckInput {
  readonly events: readonly LiveSseEvent[];
  readonly httpStatus: number;
  readonly expectedTools: readonly string[];
  readonly knownIds: ReadonlySet<string>;
  readonly groundingMode: GroundingMode;
  readonly truthByListingId: ReadonlyMap<string, SeedListingTruth>;
  readonly expectedShowCard: boolean | undefined;
}

export interface TurnHardCheckResults {
  readonly noErrors: CheckResult;
  readonly toolExpectation: CheckResult;
  readonly noFabricatedIds: CheckResult;
  readonly grounding: CheckResult;
  readonly showCard: CheckResult;
}

/** Run every per-turn hard check. Order matters for the report, not for correctness. */
export function runTurnHardChecks(input: TurnHardCheckInput): TurnHardCheckResults {
  return {
    noErrors: checkNoErrors({ events: input.events, httpStatus: input.httpStatus }),
    toolExpectation: checkToolExpectation({
      events: input.events,
      expectedTools: input.expectedTools,
    }),
    noFabricatedIds: checkNoFabricatedIds({ events: input.events, knownIds: input.knownIds }),
    grounding: checkGrounding({
      events: input.events,
      mode: input.groundingMode,
      truthByListingId: input.truthByListingId,
    }),
    showCard: checkShowCard({ events: input.events, expected: input.expectedShowCard }),
  };
}

/** True only when every per-turn hard check passed. */
export function turnPassedHardChecks(results: TurnHardCheckResults): boolean {
  return Object.values(results).every((r) => r.pass);
}
