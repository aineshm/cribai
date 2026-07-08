/**
 * Post-save "open dashboard" button auto-reset (AIN-98 spec addition).
 *
 * After a save flips the floating button to its post-save state (checkmark +
 * "Open My Apartments" link), that state reverts to the resting appearance
 * on its own after ~7s rather than staying pinned indefinitely. Re-entry to
 * an already-saved page still shows the saved/link affordance via
 * CHECK_SAVED on the next mount — this only auto-resets the CURRENT
 * session's post-save flash.
 *
 * Pure timer bookkeeping — no DOM/`chrome.*` access — so it's unit-testable
 * on its own; `content/index.ts` wires it to `handle.setView`/`setHref`.
 */

export const SAVED_RESET_DELAY_MS = 7_000;

export interface SavedResetController {
  /** (Re)start the reset countdown, replacing any pending timer. */
  readonly schedule: () => void;
  /** Cancel a pending reset, if any. Safe to call when nothing is scheduled. */
  readonly cancel: () => void;
}

export function createSavedResetController(
  onReset: () => void,
  delayMs: number = SAVED_RESET_DELAY_MS,
): SavedResetController {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule: () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        onReset();
      }, delayMs);
    },
    cancel: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
