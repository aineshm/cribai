import { describe, expect, it, vi } from 'vitest';
import { probeRuntime } from '../probe';
import type { TurnResult } from '../http-turn';

function okResult(requestId = 'probe-1'): TurnResult {
  return { requestId, httpStatus: 200, events: [{ type: 'done' }], transcript: '' };
}

describe('probeRuntime', () => {
  it('resolves when the probe turn is 200 and runtime is llm_first', async () => {
    const fetchRuntimeForRequestId = vi.fn().mockResolvedValue('llm_first');
    await expect(
      probeRuntime({ postProbeTurn: () => Promise.resolve(okResult()), fetchRuntimeForRequestId }),
    ).resolves.toBeUndefined();
    expect(fetchRuntimeForRequestId).toHaveBeenCalledWith('probe-1');
  });

  it('throws when the probe turn is non-200', async () => {
    const result: TurnResult = { requestId: 'p1', httpStatus: 503, events: [], transcript: '' };
    await expect(
      probeRuntime({
        postProbeTurn: () => Promise.resolve(result),
        fetchRuntimeForRequestId: vi.fn(),
      }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it('throws when the runtime is deterministic, not llm_first', async () => {
    await expect(
      probeRuntime({
        postProbeTurn: () => Promise.resolve(okResult()),
        fetchRuntimeForRequestId: vi.fn().mockResolvedValue('deterministic'),
      }),
    ).rejects.toThrow(/llm_first/);
  });

  it('throws when no metrics row was found at all after exhausting the poll', async () => {
    const fetchRuntimeForRequestId = vi.fn().mockResolvedValue(null);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(
      probeRuntime({
        postProbeTurn: () => Promise.resolve(okResult()),
        fetchRuntimeForRequestId,
        sleepFn,
      }),
    ).rejects.toThrow(/aborting/);

    // CodeRabbit PR #123 fix 6 — 3 attempts total (default), 2 sleeps between them.
    expect(fetchRuntimeForRequestId).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it('polls past a null row that has not landed yet, then succeeds once it does (CodeRabbit PR #123 fix 6)', async () => {
    const fetchRuntimeForRequestId = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('llm_first');
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(
      probeRuntime({ postProbeTurn: () => Promise.resolve(okResult()), fetchRuntimeForRequestId, sleepFn }),
    ).resolves.toBeUndefined();

    expect(fetchRuntimeForRequestId).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenNthCalledWith(1, 2000);
  });

  it('does NOT poll when the runtime is a non-null mismatch — fails fast', async () => {
    const fetchRuntimeForRequestId = vi.fn().mockResolvedValue('deterministic');
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(
      probeRuntime({ postProbeTurn: () => Promise.resolve(okResult()), fetchRuntimeForRequestId, sleepFn }),
    ).rejects.toThrow(/llm_first/);

    expect(fetchRuntimeForRequestId).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });
});
