/**
 * Unit tests for the save-button state machine (AIN-72).
 * Tests the pure viewFor() function for all states.
 */
import { describe, it, expect } from 'vitest';
import { viewFor, type SaveButtonState } from '../state-machine';
import type { ButtonView } from '../state-machine';

// ---------------------------------------------------------------------------
// Expected view shapes per state
// ---------------------------------------------------------------------------

const CASES: Array<[SaveButtonState, Partial<ButtonView>]> = [
  [
    'idle',
    { label: 'Save to CribAI', disabled: false, showSpinner: false, showCheck: false },
  ],
  ['saving', { label: 'Saving…', disabled: true, showSpinner: true }],
  ['analyzing', { label: 'Analyzing listing…', disabled: true, showSpinner: true }],
  ['saved', { label: 'Added to CribAI', showCheck: true, animate: true, disabled: true }],
  // already_saved: click opens CRM (button is not disabled so it wraps in a link)
  ['already_saved', { label: 'Saved ✓', showCheck: true, animate: false, disabled: false }],
  ['signed_out', { label: 'Save to CribAI', disabled: false }],
  ['error', { disabled: false }],
];

describe('viewFor — all states', () => {
  it.each(CASES)('view for %s matches expected shape', (state, expected) => {
    expect(viewFor(state)).toMatchObject(expected);
  });
});

// ---------------------------------------------------------------------------
// Error state — sublabel carries detail
// ---------------------------------------------------------------------------

describe('viewFor — error detail', () => {
  it('error view carries the detail string as sublabel', () => {
    const view = viewFor('error', 'Rate limit hit — try again in an hour.');
    expect(view.sublabel).toBe('Rate limit hit — try again in an hour.');
  });

  it('error view has retry label regardless of detail', () => {
    expect(viewFor('error').label).toBe('Save failed — retry');
    expect(viewFor('error', 'some detail').label).toBe('Save failed — retry');
  });
});

// ---------------------------------------------------------------------------
// Saved state — deep-scan sublabel
// ---------------------------------------------------------------------------

describe('viewFor — saved with deepScanQueued flag', () => {
  it('saved view carries deep-scan sublabel when flag is set', () => {
    const view = viewFor('saved', undefined, { deepScanQueued: true });
    expect(view.sublabel).toMatch(/deep scan/i);
  });

  it('saved view has no sublabel when deepScanQueued is false', () => {
    const view = viewFor('saved', undefined, { deepScanQueued: false });
    expect(view.sublabel).toBeUndefined();
  });

  it('saved view has no sublabel when flags are omitted', () => {
    const view = viewFor('saved');
    expect(view.sublabel).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Analyzing state
// ---------------------------------------------------------------------------

describe('viewFor — analyzing state', () => {
  it('analyzing shows a sublabel hinting at expected duration', () => {
    const view = viewFor('analyzing');
    expect(view.sublabel).toBeTruthy();
    expect(view.sublabel).toMatch(/10 seconds/i);
  });

  it('analyzing has spinner and no checkmark', () => {
    const view = viewFor('analyzing');
    expect(view.showSpinner).toBe(true);
    expect(view.showCheck).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Already-saved state
// ---------------------------------------------------------------------------

describe('viewFor — already_saved state', () => {
  it('already_saved has a sublabel pointing to My Apartments', () => {
    const view = viewFor('already_saved');
    expect(view.sublabel).toBeTruthy();
    expect(view.sublabel).toMatch(/apartment/i);
  });

  it('already_saved is enabled (click opens CRM)', () => {
    expect(viewFor('already_saved').disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Immutability — viewFor must return a new object each time
// ---------------------------------------------------------------------------

describe('viewFor — immutability', () => {
  it('returns a new object on each call (no shared mutable state)', () => {
    const a = viewFor('idle');
    const b = viewFor('idle');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Signed-out state with hint detail
// ---------------------------------------------------------------------------

describe('viewFor — signed_out with hint', () => {
  it('signed_out with detail carries the hint as sublabel', () => {
    const hint = 'Click the CribAI icon in your toolbar to sign in first';
    const view = viewFor('signed_out', hint);
    expect(view.sublabel).toBe(hint);
  });

  it('signed_out without detail has no sublabel', () => {
    expect(viewFor('signed_out').sublabel).toBeUndefined();
  });
});
