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

const PRICING = {
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

// Running session totals for monitoring
let sessionInputTokens = 0;
let sessionOutputTokens = 0;
let sessionCost = 0;

export function logTokenUsage(
  model: string,
  usageMetadata: UsageMetadata | undefined,
): TokenUsage | null {
  if (!usageMetadata) return null;

  const inputTokens = usageMetadata.promptTokenCount ?? 0;
  const outputTokens = usageMetadata.candidatesTokenCount ?? 0;
  const cachedTokens = usageMetadata.cachedContentTokenCount ?? 0;
  const nonCachedInput = inputTokens - cachedTokens;

  const pricing = PRICING[model as keyof typeof PRICING] ?? PRICING['gemini-2.5-flash'];
  const estimatedCost =
    nonCachedInput * pricing.input +
    cachedTokens * pricing.cached +
    outputTokens * pricing.output;

  sessionInputTokens += inputTokens;
  sessionOutputTokens += outputTokens;
  sessionCost += estimatedCost;

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
    ` | $${estimatedCost.toFixed(6)}` +
    ` | session:$${sessionCost.toFixed(4)}`,
  );

  return usage;
}

export function getSessionCost(): {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCost: number;
} {
  return {
    inputTokens: sessionInputTokens,
    outputTokens: sessionOutputTokens,
    estimatedCost: sessionCost,
  };
}

export function resetSessionCost(): void {
  sessionInputTokens = 0;
  sessionOutputTokens = 0;
  sessionCost = 0;
}
