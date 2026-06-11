/**
 * PDR-004 Track A Days 3-4 — runtime selector (AIN-8)
 * AIN-65 / WS6 — surface-scoped CRM escalation.
 *
 * v1 is env switches only — the LLM-first runtime ships DARK:
 *   CRIBAI_RUNTIME_LLM_FIRST='1'                  → 'llm_first' (global)
 *   surface==='crm' AND CRIBAI_RUNTIME_CRM='1'    → 'llm_first' (CRM-only)
 *   anything else (incl. unset)                   → 'deterministic' (default)
 *
 * The CRM flag is an independent kill-switch: it lets the /my-apartments chat
 * surface ride the LLM-first runtime while explore stays deterministic, and
 * can be flipped off without touching the global rollout flag. The global
 * flag's behavior is unchanged and always wins when set.
 *
 * The percentage ramp + per-user sticky bucketing is explicitly DEFERRED to
 * AIN-10 — do NOT build it here. `userId` is accepted in the signature now so
 * AIN-10 can add bucketing without changing every call site, but it is
 * intentionally unused in v1.
 *
 * The selector depends only on env + userId + the route-validated surface —
 * all available at handler entry, BEFORE the metrics recorder is constructed —
 * so the recorder's `runtime` label is correct even on early-return error rows.
 */

import type { RuntimeKind } from './metrics';

export interface SelectRuntimeInput {
  /** Env bag (defaults to `process.env`). Injectable for tests. */
  readonly env?: Record<string, string | undefined>;
  /** Authenticated user id, or null for guests. Unused in v1 (AIN-10). */
  readonly userId?: string | null;
  /**
   * Request surface, pre-validated by the route (only the literal 'crm' is
   * ever passed; anything else arrives as undefined). NOTE: clients CAN spoof
   * `surface:'crm'` to opt into LLM-first early — accepted risk: CRM tools
   * are sign-in-gated, rate limits apply, and the per-turn cost cap observes.
   */
  readonly surface?: 'crm' | null;
}

/** The env flag that turns the LLM-first runtime on globally. `'1'` = enabled. */
export const LLM_FIRST_FLAG = 'CRIBAI_RUNTIME_LLM_FIRST';

/** The env kill-switch that escalates ONLY the CRM surface. `'1'` = enabled. */
export const CRM_SURFACE_FLAG = 'CRIBAI_RUNTIME_CRM';

export function selectRuntime(input: SelectRuntimeInput = {}): RuntimeKind {
  const env = input.env ?? process.env;
  if (env[LLM_FIRST_FLAG] === '1') return 'llm_first';
  if (input.surface === 'crm' && env[CRM_SURFACE_FLAG] === '1') return 'llm_first';
  return 'deterministic';
}
