/**
 * AIN-93 — throttle detection + retry (plan decision 8).
 *
 * A persistent throttle (429 pre-stream rate limit, or the mid-stream quota
 * `error` frame the route emits — "CribAI is temporarily unavailable due to
 * high demand...") must be distinguishable from a genuine product failure in
 * the report. Up to `maxRetries` retries with exponential backoff; if still
 * throttled after exhausting them, the turn is labeled `throttled: true`
 * rather than folded into a plain hard-check failure.
 */
import type { TurnResult } from './http-turn';

const THROTTLE_TEXT_PATTERN = /high demand|quota|rate limit exceeded/i;

export function isThrottled(result: Pick<TurnResult, 'httpStatus' | 'events'>): boolean {
  if (result.httpStatus === 429) return true;
  return result.events.some(
    (e) => e.type === 'error' && THROTTLE_TEXT_PATTERN.test((e as { message: string }).message),
  );
}

export interface PostTurnWithThrottleRetryOptions {
  readonly maxRetries: number;
  readonly backoffBaseMs: number;
  readonly sleepFn: (ms: number) => Promise<void>;
  readonly postTurnFn: () => Promise<TurnResult>;
}

export interface RetryingTurnResult {
  readonly result: TurnResult;
  /** True only when STILL throttled after exhausting all retries. */
  readonly throttled: boolean;
  readonly retries: number;
}

export async function postTurnWithThrottleRetry(
  options: PostTurnWithThrottleRetryOptions,
): Promise<RetryingTurnResult> {
  let attempt = 0;
  let result = await options.postTurnFn();

  while (isThrottled(result) && attempt < options.maxRetries) {
    await options.sleepFn(options.backoffBaseMs * 2 ** attempt);
    attempt += 1;
    result = await options.postTurnFn();
  }

  return { result, throttled: isThrottled(result), retries: attempt };
}
