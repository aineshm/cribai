/**
 * PDR-004 Track A Days 5-6 (AIN-9) — per-turn cost projection + cap guard.
 *
 * Projects the USD cost of one LLM-first turn from token usage and compares it
 * against the per-turn budget cap (PDR-004 §Risks: $0.05/turn). Reuses the
 * cost-logger PRICING table — the pricing is NOT duplicated here.
 *
 * R5 PRICING NOTE: PDR-004 cites $0.30/$2.50 per-M (AI Studio LIST). The
 * cost-logger table this module imports uses the VERTEX blended price
 * ($0.15/$0.60 per-M) — prod runs on Vertex. Both the cap and the model id are
 * env-overridable so a pricing or vendor change doesn't need a code edit.
 */

import { PRICING } from '../cost-logger';
import { ACTIVE_MODEL_ID } from './ai-sdk-provider';

/** Token usage for one turn (normalized from the AI SDK `LanguageModelUsage`). */
export interface TurnUsage {
  /** TOTAL input/prompt tokens (includes cached). */
  readonly inputTokens: number;
  /** Output/completion tokens. */
  readonly outputTokens: number;
  /** Cached (prompt) tokens read — billed at the discounted cached rate. */
  readonly cachedTokens?: number;
}

export interface TurnCost {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  /** Non-cached input tokens (inputTokens − cachedTokens, floored at 0). */
  readonly nonCachedInputTokens: number;
  /** Projected USD cost for the turn. */
  readonly costUsd: number;
}

/**
 * Default per-turn cost cap (USD). Override via CRIBAI_TURN_COST_CAP_USD.
 *
 * Recalibrated for the OpenAI default (PR 2): gpt-5.4-mini bills reasoning
 * tokens as output at $4.50/M (vs Gemini-Vertex $0.60/M), so a heavy
 * reasoning+tool turn lands near $0.30-0.35 where Gemini sat at ~$0.05. The cap
 * is an ANOMALY/alerting signal (observe-only — it logs + tags Langfuse, never
 * throws), so it's set above normal heavy turns to flag genuine runaways, not
 * to spam on every reasoning turn. Lower it via env for tighter Gemini-era
 * budgets (AI_PROVIDER=google).
 */
export const TURN_COST_CAP_USD_DEFAULT = 0.5;

// FIX 6 — fail LOUD at module load if the ACTIVE model id isn't priced. The
// previous `?? PRICING['gemini-2.5-flash']` fallback silently used stale
// pricing when the model id was bumped past what the cost-logger table knows.
// PR 2: prices the ACTIVE model (OpenAI default or Google) — the guard must
// pass for whichever provider AI_PROVIDER selects.
if (!Object.prototype.hasOwnProperty.call(PRICING, ACTIVE_MODEL_ID)) {
  throw new Error(
    `[turn-cost] active model id "${ACTIVE_MODEL_ID}" has no entry in the cost-logger ` +
      `PRICING table (known: ${Object.keys(PRICING).join(', ')}). Add its pricing ` +
      `before selecting it via AI_PROVIDER / AI_MODEL_ID.`,
  );
}
const PRICING_KEY = ACTIVE_MODEL_ID as keyof typeof PRICING;

function nonNegative(n: number | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Project the USD cost of a turn. Cached tokens are billed at the discounted
 * `cached` rate; the remaining (non-cached) input at the `input` rate; output
 * at the `output` rate. Mirrors the math in `cost-logger.logTokenUsage`.
 */
export function projectTurnCost(usage: TurnUsage): TurnCost {
  const inputTokens = nonNegative(usage.inputTokens);
  const outputTokens = nonNegative(usage.outputTokens);
  // Cached can't exceed total input.
  const cachedTokens = Math.min(nonNegative(usage.cachedTokens), inputTokens);
  const nonCachedInputTokens = Math.max(inputTokens - cachedTokens, 0);

  const pricing = PRICING[PRICING_KEY];
  const costUsd =
    nonCachedInputTokens * pricing.input +
    cachedTokens * pricing.cached +
    outputTokens * pricing.output;

  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    nonCachedInputTokens,
    costUsd,
  };
}

/** True when `costUsd` strictly exceeds the cap. */
export function isOverCap(costUsd: number, capUsd: number): boolean {
  return costUsd > capUsd;
}

/**
 * Resolve the per-turn cap from env (CRIBAI_TURN_COST_CAP_USD), falling back to
 * the default. A malformed / non-positive override is ignored.
 */
export function resolveTurnCostCapUsd(
  env: { CRIBAI_TURN_COST_CAP_USD?: string } = process.env,
): number {
  const raw = env.CRIBAI_TURN_COST_CAP_USD;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return TURN_COST_CAP_USD_DEFAULT;
}
