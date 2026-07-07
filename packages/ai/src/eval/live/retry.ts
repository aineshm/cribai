/**
 * AIN-93 — throttle + network-failure detection and retry (plan decision 8,
 * CodeRabbit PR #123 fix 7).
 *
 * A persistent throttle (429 pre-stream rate limit, or the mid-stream quota
 * `error` frame the route emits — "CribAI is temporarily unavailable due to
 * high demand...") must be distinguishable from a genuine product failure in
 * the report. Up to `maxRetries` retries with exponential backoff; if still
 * throttled after exhausting them, the turn is labeled `throttled: true`
 * rather than folded into a plain hard-check failure.
 *
 * A network-failed turn (`postTurn`'s `httpStatus: 0` shape — see
 * `http-turn.ts` fixes 4/5) is a transient blip just as often as a throttle
 * is, so it gets the SAME bounded retry treatment, bounded by the SAME
 * `maxRetries`. It is labeled distinctly (`networkFailure: true`, not
 * `throttled: true`) once persistent — the report should say "the network
 * dropped" rather than "the product throttled us". `postTurnFn` itself is
 * also defensively wrapped: even though `postTurn` no longer throws, a
 * caller-supplied closure could fail before ever reaching it, and that
 * should retry exactly the same way rather than crashing the run.
 */
import type { TurnResult } from './http-turn';

const THROTTLE_TEXT_PATTERN = /high demand|quota|rate limit exceeded/i;

export function isThrottled(result: Pick<TurnResult, 'httpStatus' | 'events'>): boolean {
  if (result.httpStatus === 429) return true;
  return result.events.some(
    (e) => e.type === 'error' && THROTTLE_TEXT_PATTERN.test((e as { message: string }).message),
  );
}

/** `postTurn`'s failure shape for a timeout/network error (never a thrown rejection — see http-turn.ts). */
export function isNetworkFailure(result: Pick<TurnResult, 'httpStatus'>): boolean {
  return result.httpStatus === 0;
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
  /** True only when STILL network-failed (and not throttled) after exhausting all retries. */
  readonly networkFailure: boolean;
  readonly retries: number;
}

/** Defensive: a thrown `postTurnFn` rejection is folded into the same network-failure shape `postTurn` itself returns. */
async function callPostTurn(postTurnFn: () => Promise<TurnResult>): Promise<TurnResult> {
  try {
    return await postTurnFn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { requestId: 'unknown', httpStatus: 0, events: [], transcript: message };
  }
}

export async function postTurnWithThrottleRetry(
  options: PostTurnWithThrottleRetryOptions,
): Promise<RetryingTurnResult> {
  let attempt = 0;
  let result = await callPostTurn(options.postTurnFn);

  while ((isThrottled(result) || isNetworkFailure(result)) && attempt < options.maxRetries) {
    await options.sleepFn(options.backoffBaseMs * 2 ** attempt);
    attempt += 1;
    result = await callPostTurn(options.postTurnFn);
  }

  const throttled = isThrottled(result);
  return { result, throttled, networkFailure: !throttled && isNetworkFailure(result), retries: attempt };
}
