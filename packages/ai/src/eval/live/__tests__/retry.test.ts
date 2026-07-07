import { describe, expect, it, vi } from 'vitest';
import { isThrottled, postTurnWithThrottleRetry } from '../retry';
import type { TurnResult } from '../http-turn';

function ok(): TurnResult {
  return { requestId: 'r1', httpStatus: 200, events: [{ type: 'done' }], transcript: '' };
}

function rateLimited429(): TurnResult {
  return { requestId: 'r1', httpStatus: 429, events: [], transcript: '' };
}

function quotaErrorFrame(): TurnResult {
  return {
    requestId: 'r1',
    httpStatus: 200,
    events: [
      { type: 'error', message: 'CribAI is temporarily unavailable due to high demand. Please try again in a minute.' },
    ],
    transcript: '',
  };
}

describe('isThrottled', () => {
  it('is false for a clean 200 turn', () => {
    expect(isThrottled(ok())).toBe(false);
  });

  it('is true for a 429 response', () => {
    expect(isThrottled(rateLimited429())).toBe(true);
  });

  it('is true for a mid-stream quota error frame', () => {
    expect(isThrottled(quotaErrorFrame())).toBe(true);
  });

  it('is false for a genuine (non-throttle) error frame', () => {
    const result: TurnResult = {
      requestId: 'r1',
      httpStatus: 200,
      events: [{ type: 'error', message: 'Internal server error' }],
      transcript: '',
    };
    expect(isThrottled(result)).toBe(false);
  });
});

describe('postTurnWithThrottleRetry', () => {
  it('returns immediately on a non-throttled result, no sleep', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const postTurnFn = vi.fn().mockResolvedValue(ok());

    const result = await postTurnWithThrottleRetry({
      maxRetries: 2,
      backoffBaseMs: 1000,
      sleepFn,
      postTurnFn,
    });

    expect(result.throttled).toBe(false);
    expect(result.retries).toBe(0);
    expect(sleepFn).not.toHaveBeenCalled();
    expect(postTurnFn).toHaveBeenCalledTimes(1);
  });

  it('retries with exponential backoff and succeeds on the 2nd attempt', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const postTurnFn = vi.fn().mockResolvedValueOnce(rateLimited429()).mockResolvedValueOnce(ok());

    const result = await postTurnWithThrottleRetry({
      maxRetries: 2,
      backoffBaseMs: 1000,
      sleepFn,
      postTurnFn,
    });

    expect(result.throttled).toBe(false);
    expect(result.retries).toBe(1);
    expect(postTurnFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(1000); // backoffBaseMs * 2^0
  });

  it('labels the turn throttled after exhausting all retries', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const postTurnFn = vi.fn().mockResolvedValue(rateLimited429());

    const result = await postTurnWithThrottleRetry({
      maxRetries: 2,
      backoffBaseMs: 1000,
      sleepFn,
      postTurnFn,
    });

    expect(result.throttled).toBe(true);
    expect(result.retries).toBe(2);
    expect(postTurnFn).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(sleepFn).toHaveBeenNthCalledWith(1, 1000); // base * 2^0
    expect(sleepFn).toHaveBeenNthCalledWith(2, 2000); // base * 2^1
  });
});
