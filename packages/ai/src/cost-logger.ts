/**
 * Token usage and cost logging for Gemini API calls.
 * Tracks input/output tokens per request to monitor burn rate against $49 GCP budget.
 *
 * Vertex AI pricing (Gemini 2.5 Flash):
 *   Input:  $0.15 / 1M tokens
 *   Output: $0.60 / 1M tokens
 *   Cached: $0.01875 / 1M tokens (87.5% cheaper)
 *
 * Embedding pricing (gemini-embedding-001):
 *   Input:  $0.00015 / 1K tokens
 *   Output: free
 */

/**
 * Per-token pricing (USD). Exported so the LLM-first turn-cost projector
 * (runtime/turn-cost.ts) reuses the SAME numbers — no duplicate pricing table.
 *
 * R5 PRICING NOTE (AIN-9): PDR-004 §Risks cites $0.30/M input, $2.50/M output
 * as the Gemini 2.5 Flash AI Studio LIST price. These values are the VERTEX AI
 * blended price ($0.15/M in, $0.60/M out). Prod runs on Vertex, so we use the
 * Vertex numbers here and in the turn-cost projector. If/when prod moves to AI
 * Studio list pricing, bump these (or override via env in turn-cost).
 */
export const PRICING = {
  'gemini-2.5-flash': {
    input: 0.15 / 1_000_000,
    output: 0.60 / 1_000_000,
    cached: 0.01875 / 1_000_000,
  },
  'gemini-embedding-001': {
    input: 0.00015 / 1_000,
    output: 0,
    cached: 0,
  },
  // PR 2 (PDR-004 OpenAI inference swap) — OpenAI API LIST pricing (per 1M tokens):
  //   gpt-5.4-mini → $0.75 in / $4.50 out / $0.075 cached input.
  // Active model under AI_PROVIDER=openai (the new default). Cached input is a
  // 90% discount (OpenAI auto-caches server-side; no explicit cache wiring).
  'gpt-5.4-mini': {
    input: 0.75 / 1_000_000,
    output: 4.50 / 1_000_000,
    cached: 0.075 / 1_000_000,
  },
  // Known-good fallback (AI_MODEL_ID=gpt-4o) — non-reasoning, identical
  // streamText + tool-calling loop. OpenAI LIST: $2.50 in / $10.00 out /
  // $1.25 cached input per 1M.
  'gpt-4o': {
    input: 2.50 / 1_000_000,
    output: 10.00 / 1_000_000,
    cached: 1.25 / 1_000_000,
  },
} as const;

export interface TokenUsage {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly estimatedCost: number;
}

interface UsageMetadata {
  readonly promptTokenCount?: number;
  readonly candidatesTokenCount?: number;
  readonly totalTokenCount?: number;
  readonly cachedContentTokenCount?: number;
}

export function logTokenUsage(
  model: string,
  usageMetadata: UsageMetadata | undefined,
): TokenUsage | null {
  if (!usageMetadata) return null;

  const inputTokens = usageMetadata.promptTokenCount ?? 0;
  const outputTokens = usageMetadata.candidatesTokenCount ?? 0;
  const cachedTokens = usageMetadata.cachedContentTokenCount ?? 0;
  const nonCachedInput = inputTokens - cachedTokens;

  const knownModel = model as keyof typeof PRICING;
  if (!(knownModel in PRICING)) {
    console.warn(`[cost] Unknown model "${model}" — falling back to gemini-2.5-flash pricing`);
  }
  const pricing = PRICING[knownModel] ?? PRICING['gemini-2.5-flash'];
  const estimatedCost =
    nonCachedInput * pricing.input +
    cachedTokens * pricing.cached +
    outputTokens * pricing.output;

  const usage: TokenUsage = {
    model,
    inputTokens,
    outputTokens,
    cachedTokens,
    estimatedCost,
  };

  console.log(
    `[cost] ${model} | in:${inputTokens} out:${outputTokens}` +
    (cachedTokens > 0 ? ` cached:${cachedTokens}` : '') +
    ` | $${estimatedCost.toFixed(6)}`,
  );

  return usage;
}
