/**
 * Save-button view model (pure state → view mapping, AIN-72).
 *
 * All state transitions happen in content/index.ts; this module is purely
 * functional — given a state (and optional detail/flags), it returns the
 * complete view descriptor that save-button.ts renders.
 *
 * NOTE: `signed_out` and `idle` render the same button appearance; the
 * difference is in how the click is handled in index.ts.
 */

export type SaveButtonState =
  | 'idle'
  | 'saving'
  | 'analyzing'
  | 'saved'
  | 'already_saved'
  | 'signed_out'
  | 'error';

export interface ButtonView {
  readonly label: string;
  readonly sublabel?: string;
  readonly disabled: boolean;
  readonly showSpinner: boolean;
  readonly showCheck: boolean;
  /** Play the confirmation animation on entering this view. */
  readonly animate: boolean;
}

/**
 * Derive the button view from the current state.
 *
 * @param state  Current button state.
 * @param detail Optional error message (used in `error` state) or sign-in
 *               hint (used in `signed_out` state).
 * @param flags  Optional behaviour flags from the save response.
 */
export function viewFor(
  state: SaveButtonState,
  detail?: string,
  flags?: { readonly deepScanQueued?: boolean },
): ButtonView {
  switch (state) {
    case 'idle':
      return {
        label: 'Save to CribAI',
        disabled: false,
        showSpinner: false,
        showCheck: false,
        animate: false,
      };

    case 'saving':
      return {
        label: 'Saving…',
        disabled: true,
        showSpinner: true,
        showCheck: false,
        animate: false,
      };

    case 'analyzing':
      return {
        label: 'Analyzing listing…',
        sublabel: 'This can take ~10 seconds',
        disabled: true,
        showSpinner: true,
        showCheck: false,
        animate: false,
      };

    case 'saved':
      return {
        label: 'Added to CribAI',
        sublabel: flags?.deepScanQueued
          ? 'Deep scan running — details fill in over the next few hours'
          : undefined,
        disabled: true,
        showSpinner: false,
        showCheck: true,
        animate: true,
      };

    case 'already_saved':
      return {
        label: 'Saved ✓',
        sublabel: 'Open My Apartments',
        disabled: false,
        showSpinner: false,
        showCheck: true,
        animate: false,
      };

    case 'signed_out':
      return {
        label: 'Save to CribAI',
        sublabel: detail,
        disabled: false,
        showSpinner: false,
        showCheck: false,
        animate: false,
      };

    case 'error':
      return {
        label: 'Save failed — retry',
        sublabel: detail,
        disabled: false,
        showSpinner: false,
        showCheck: false,
        animate: false,
      };
  }
}
