/**
 * Tests for the AIN-98 post-save "open dashboard" auto-reset timer.
 *
 * `content/index.ts` orchestrates DOM + `chrome.runtime` state and has no
 * test coverage of its own (vitest here runs in a DOM-less `node`
 * environment — see save-button.test.ts's own note on this). The timer
 * logic is pure (setTimeout is available in `node`), so it's extracted here
 * the same way state-machine.ts was split out as the testable piece
 * alongside DOM orchestration that isn't unit-tested directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSavedResetController, SAVED_RESET_DELAY_MS } from '../saved-reset-timer';

describe('createSavedResetController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onReset after the default delay', () => {
    const onReset = vi.fn();
    const controller = createSavedResetController(onReset);

    controller.schedule();
    expect(onReset).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SAVED_RESET_DELAY_MS);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('defaults the delay to 7 seconds (AIN-98 spec)', () => {
    expect(SAVED_RESET_DELAY_MS).toBe(7_000);
  });

  it('does not fire before the delay elapses', () => {
    const onReset = vi.fn();
    const controller = createSavedResetController(onReset);

    controller.schedule();
    vi.advanceTimersByTime(SAVED_RESET_DELAY_MS - 1);
    expect(onReset).not.toHaveBeenCalled();
  });

  it('cancel() prevents a scheduled reset from firing', () => {
    const onReset = vi.fn();
    const controller = createSavedResetController(onReset);

    controller.schedule();
    controller.cancel();
    vi.advanceTimersByTime(SAVED_RESET_DELAY_MS);

    expect(onReset).not.toHaveBeenCalled();
  });

  it('cancel() is a no-op when nothing is scheduled', () => {
    const onReset = vi.fn();
    const controller = createSavedResetController(onReset);
    expect(() => controller.cancel()).not.toThrow();
    expect(onReset).not.toHaveBeenCalled();
  });

  it('re-scheduling replaces the pending timer instead of stacking calls', () => {
    const onReset = vi.fn();
    const controller = createSavedResetController(onReset);

    controller.schedule();
    vi.advanceTimersByTime(3_000); // a second save mid-window
    controller.schedule();
    vi.advanceTimersByTime(SAVED_RESET_DELAY_MS - 1);
    expect(onReset).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom delay', () => {
    const onReset = vi.fn();
    const controller = createSavedResetController(onReset, 1_000);

    controller.schedule();
    vi.advanceTimersByTime(999);
    expect(onReset).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
