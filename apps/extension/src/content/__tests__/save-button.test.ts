/**
 * Unit tests for save-button.ts pure rendering helpers (AIN-72).
 *
 * These tests cover `buttonClasses` and `buttonInnerHtml` — the pure pieces
 * that can be tested without a DOM.
 *
 * DOM mounting (`createSaveButton`) is not covered here because vitest's
 * environment is `node` (no happy-dom). The DOM behavior is exercised via
 * the manual smoke test in Task 7.
 */
import { describe, it, expect } from 'vitest';
import { buttonClasses, buttonInnerHtml } from '../save-button';
import { viewFor } from '../state-machine';

// ---------------------------------------------------------------------------
// buttonClasses
// ---------------------------------------------------------------------------

describe('buttonClasses', () => {
  it('idle view → "btn" only', () => {
    expect(buttonClasses(viewFor('idle'))).toBe('btn');
  });

  it('saving view → "btn disabled"', () => {
    expect(buttonClasses(viewFor('saving'))).toBe('btn disabled');
  });

  it('analyzing view → "btn disabled"', () => {
    expect(buttonClasses(viewFor('analyzing'))).toBe('btn disabled');
  });

  it('saved view → "btn disabled success animate"', () => {
    const classes = buttonClasses(viewFor('saved'));
    expect(classes).toContain('btn');
    expect(classes).toContain('disabled');
    expect(classes).toContain('success');
    expect(classes).toContain('animate');
    expect(classes).not.toContain('no-animate');
  });

  it('already_saved view → "btn success no-animate" (no disabled, no animate)', () => {
    const classes = buttonClasses(viewFor('already_saved'));
    expect(classes).toContain('btn');
    expect(classes).toContain('success');
    expect(classes).toContain('no-animate');
    expect(classes).not.toContain('disabled');
    expect(classes).not.toContain(' animate'); // space-prefixed to avoid "no-animate" match
  });

  it('error view → "btn" only (enabled for retry)', () => {
    expect(buttonClasses(viewFor('error'))).toBe('btn');
  });

  it('signed_out view → "btn" only (enabled to prompt sign-in)', () => {
    expect(buttonClasses(viewFor('signed_out'))).toBe('btn');
  });
});

// ---------------------------------------------------------------------------
// buttonInnerHtml
// ---------------------------------------------------------------------------

describe('buttonInnerHtml', () => {
  it('idle view — renders label text, no spinner, no checkmark', () => {
    const html = buttonInnerHtml(viewFor('idle'));
    expect(html).toContain('Save to CribAI');
    expect(html).not.toContain('class="spinner"');
    expect(html).not.toContain('<svg');
  });

  it('saving view — renders spinner', () => {
    const html = buttonInnerHtml(viewFor('saving'));
    expect(html).toContain('class="spinner"');
    expect(html).toContain('Saving');
  });

  it('analyzing view — renders spinner and sublabel', () => {
    const html = buttonInnerHtml(viewFor('analyzing'));
    expect(html).toContain('class="spinner"');
    expect(html).toContain('Analyzing');
    expect(html).toContain('sublabel');
  });

  it('saved view — renders checkmark SVG', () => {
    const html = buttonInnerHtml(viewFor('saved'));
    expect(html).toContain('<svg');
    expect(html).toContain('Added to CribAI');
  });

  it('already_saved view — renders checkmark SVG and sublabel', () => {
    const html = buttonInnerHtml(viewFor('already_saved'));
    expect(html).toContain('<svg');
    expect(html).toContain('Saved');
    expect(html).toContain('sublabel');
  });

  it('error view with detail — renders sublabel with the detail', () => {
    const html = buttonInnerHtml(viewFor('error', 'Rate limit hit'));
    expect(html).toContain('Save failed');
    expect(html).toContain('Rate limit hit');
    expect(html).toContain('sublabel');
  });

  it('saved view with deepScanQueued — renders deep scan sublabel', () => {
    const html = buttonInnerHtml(viewFor('saved', undefined, { deepScanQueued: true }));
    expect(html).toContain('Deep scan');
    expect(html).toContain('sublabel');
  });

  it('escapes HTML in label and sublabel to prevent injection', () => {
    // Force a view with a potentially dangerous detail string
    const html = buttonInnerHtml(viewFor('error', '<script>alert(1)</script>'));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ---------------------------------------------------------------------------
// Fix 9 — setHref uses lastView not classList inference
// ---------------------------------------------------------------------------

describe('setHref state inference (Fix 9)', () => {
  it('buttonClasses for saved view with animate:false does not contain animate class', () => {
    // Simulate what setHref does: take the last view, set animate:false, re-render.
    const savedView = viewFor('saved', undefined, { deepScanQueued: true });
    const noAnimView = { ...savedView, animate: false };
    const classes = buttonClasses(noAnimView);
    expect(classes).toContain('success');
    expect(classes).not.toContain(' animate'); // space-prefixed to avoid "no-animate" false match
    expect(classes).toContain('no-animate');
  });

  it('buttonClasses for already_saved view spread with animate:false is consistent', () => {
    const alreadySavedView = viewFor('already_saved');
    const noAnimView = { ...alreadySavedView, animate: false };
    // already_saved never animates — spreading should not add animate
    const classes = buttonClasses(noAnimView);
    expect(classes).toContain('success');
    expect(classes).not.toContain(' animate');
  });

  it('buttonInnerHtml preserves sublabel when view is spread with animate:false', () => {
    const savedView = viewFor('saved', undefined, { deepScanQueued: true });
    const noAnimView = { ...savedView, animate: false };
    const html = buttonInnerHtml(noAnimView);
    // sublabel must still be present (Fix 10: old deepScanQueued:false rebuild dropped it)
    expect(html).toContain('Deep scan');
    expect(html).toContain('sublabel');
  });
});
