/**
 * PDR-004 Track A Days 3-4 — runtime selector (AIN-8)
 *
 * v1 is a BINARY env switch only — the LLM-first runtime ships DARK:
 *   CRIBAI_RUNTIME_LLM_FIRST='1' → 'llm_first'
 *   anything else (incl. unset)  → 'deterministic'  (default, unchanged path)
 *
 * The percentage ramp + per-user sticky bucketing is explicitly DEFERRED to
 * AIN-10 — do NOT build it here. `userId` is accepted in the signature now so
 * AIN-10 can add bucketing without changing every call site, but it is
 * intentionally unused in v1.
 *
 * The selector depends only on env + userId — both available at handler entry,
 * BEFORE the metrics recorder is constructed — so the recorder's `runtime`
 * label is correct even on early-return error rows.
 */

import type { RuntimeKind } from './metrics';

export interface SelectRuntimeInput {
  /** Env bag (defaults to `process.env`). Injectable for tests. */
  readonly env?: Record<string, string | undefined>;
  /** Authenticated user id, or null for guests. Unused in v1 (AIN-10). */
  readonly userId?: string | null;
}

/** The env flag that turns the LLM-first runtime on. `'1'` = enabled. */
export const LLM_FIRST_FLAG = 'CRIBAI_RUNTIME_LLM_FIRST';

export function selectRuntime(input: SelectRuntimeInput = {}): RuntimeKind {
  const env = input.env ?? process.env;
  return env[LLM_FIRST_FLAG] === '1' ? 'llm_first' : 'deterministic';
}
