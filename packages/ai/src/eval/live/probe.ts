/**
 * AIN-93 — runtime probe (recon fact 2 / plan decision 2).
 *
 * The CRM surface being on the LLM-first runtime is proven by an earlier
 * live E2E, but this harness re-checks it EVERY run rather than assume it
 * stays true: one trivial turn, then a lookup of `ai_request_metrics.runtime`
 * by that turn's request id. Aborts the whole run with a clear message if
 * the runtime isn't `llm_first` — every other check in this harness assumes
 * CRM tools are reachable, so a deterministic-runtime probe would make every
 * downstream failure misleading.
 */
import type { TurnResult } from './http-turn';

export interface ProbeDeps {
  /** Pre-bound to post one trivial turn with `surface: 'crm'` against the target. */
  readonly postProbeTurn: () => Promise<TurnResult>;
  /** Look up `ai_request_metrics.runtime` for a given request id (null if the row hasn't landed yet / at all). */
  readonly fetchRuntimeForRequestId: (requestId: string) => Promise<string | null>;
}

export async function probeRuntime(deps: ProbeDeps): Promise<void> {
  const result = await deps.postProbeTurn();

  if (result.httpStatus !== 200) {
    throw new Error(
      `AIN-93 probe: the chat API returned HTTP ${result.httpStatus} for a trivial probe turn — ` +
        'aborting before running the full corpus.',
    );
  }

  const runtime = await deps.fetchRuntimeForRequestId(result.requestId);
  if (runtime !== 'llm_first') {
    throw new Error(
      `AIN-93 probe: expected ai_request_metrics.runtime='llm_first' for the probe turn, got ` +
        `${JSON.stringify(runtime)}. The CRM surface must be on the LLM-first runtime before this ` +
        'harness can run meaningfully — aborting.',
    );
  }
}
