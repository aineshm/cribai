/**
 * Shadow-DOM save button component (AIN-72).
 *
 * Mounts a closed shadow root on a host element appended to
 * `document.documentElement` (not `body` — survives SPA body swaps).
 * Position is set as inline style on the host element so it cannot
 * be overridden or leaked by the page stylesheet.
 *
 * All visual styling lives inside the shadow root. Zero global CSS.
 */

import { viewFor, type ButtonView, type SaveButtonState } from './state-machine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOST_ID = 'cribai-save-root';

// ---------------------------------------------------------------------------
// CSS (inside shadow root — no global leakage)
// ---------------------------------------------------------------------------

const SHADOW_CSS = `
.btn {
  all: initial;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font: 600 14px/1.2 -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #fff;
  background: #4f46e5;
  padding: 12px 18px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
  transition: background 200ms ease, transform 150ms ease, box-shadow 200ms ease;
  text-decoration: none;
}
.btn:hover:not(.disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(79, 70, 229, 0.5);
}
.btn.disabled { cursor: default; opacity: 0.85; }
.btn.success { background: #16a34a; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.4); }
.btn.success.animate { animation: cribai-pop 450ms cubic-bezier(0.34, 1.56, 0.64, 1); }

.spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  animation: cribai-spin 700ms linear infinite;
}

.check { width: 16px; height: 16px; }
.check path {
  fill: none;
  stroke: #fff;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
}
.animate .check path { animation: cribai-draw 350ms ease 120ms forwards; }
.no-animate .check path { stroke-dashoffset: 0; }

.label-wrap { display: flex; flex-direction: column; align-items: flex-start; }
.sublabel { display: block; font-size: 11px; font-weight: 400; opacity: 0.9; margin-top: 2px; }

@keyframes cribai-spin { to { transform: rotate(360deg); } }
@keyframes cribai-pop {
  0%   { transform: scale(1); }
  45%  { transform: scale(1.12); }
  100% { transform: scale(1); }
}
@keyframes cribai-draw { to { stroke-dashoffset: 0; } }

@media (prefers-reduced-motion: reduce) {
  .btn.success.animate { animation: none; }
  .animate .check path { animation: none; stroke-dashoffset: 0; }
}
`;

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

const CHECKMARK_SVG = `<svg class="check" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M4 12.5l5 5L20 6.5"/>
</svg>`;

const SPINNER_HTML = `<span class="spinner" aria-hidden="true"></span>`;

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface SaveButtonHandle {
  readonly setView: (
    state: SaveButtonState,
    detail?: string,
    flags?: { readonly deepScanQueued?: boolean },
  ) => void;
  readonly setHref: (url: string | null) => void;
  readonly unmount: () => void;
}

// ---------------------------------------------------------------------------
// Pure rendering helpers (unit-testable without a DOM)
// ---------------------------------------------------------------------------

/**
 * Derive the CSS class list for the button element from a ButtonView.
 * Returns a space-separated string of class tokens.
 */
export function buttonClasses(view: ButtonView): string {
  const classes: string[] = ['btn'];
  if (view.disabled) classes.push('disabled');
  if (view.showCheck) {
    classes.push('success');
    if (view.animate) {
      classes.push('animate');
    } else {
      classes.push('no-animate');
    }
  }
  return classes.join(' ');
}

/**
 * Render the inner HTML of the button from a ButtonView.
 */
export function buttonInnerHtml(view: ButtonView): string {
  const icon = view.showSpinner
    ? SPINNER_HTML
    : view.showCheck
      ? CHECKMARK_SVG
      : '';

  const sublabelHtml = view.sublabel
    ? `<span class="sublabel">${escapeHtml(view.sublabel)}</span>`
    : '';

  const labelHtml = sublabelHtml
    ? `<span class="label-wrap"><span>${escapeHtml(view.label)}</span>${sublabelHtml}</span>`
    : `<span>${escapeHtml(view.label)}</span>`;

  return `${icon}${labelHtml}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// DOM mounting
// ---------------------------------------------------------------------------

/**
 * Create and mount the save button.
 *
 * @param doc      The page's `document` object.
 * @param onClick  Called when the user clicks the button in a clickable state.
 * @returns A handle for updating the view and unmounting.
 */
export function createSaveButton(
  doc: Document,
  onClick: () => void,
): SaveButtonHandle {
  // Remove any stale host from a previous mount (defensive)
  doc.getElementById(HOST_ID)?.remove();

  // Host element — positioned via inline style so the page cannot override it
  const host = doc.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    'position:fixed;bottom:24px;right:24px;z-index:2147483646;';

  // Closed shadow root — page scripts cannot reach inside
  const shadow = host.attachShadow({ mode: 'closed' });

  const styleEl = doc.createElement('style');
  styleEl.textContent = SHADOW_CSS;
  shadow.appendChild(styleEl);

  // Container div — we swap its content on setView
  const container = doc.createElement('div');
  shadow.appendChild(container);

  // Append host to documentElement so it survives SPA body swaps
  doc.documentElement.appendChild(host);

  let currentHref: string | null = null;

  function render(view: ButtonView, href: string | null): void {
    const inner = `<${href ? 'a' : 'button'} class="${buttonClasses(view)}"${
      href ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener"` : ''
    }${view.disabled && !href ? ' disabled' : ''}>${buttonInnerHtml(view)}</${href ? 'a' : 'button'}>`;
    container.innerHTML = inner;

    const el = container.firstElementChild as HTMLElement | null;
    if (el && !href) {
      el.addEventListener('click', () => {
        if (!el.hasAttribute('disabled') && !el.classList.contains('disabled')) {
          onClick();
        }
      });
    }
  }

  // Initial render
  const initialView = viewFor('idle');
  render(initialView, null);

  function setView(
    state: SaveButtonState,
    detail?: string,
    flags?: { readonly deepScanQueued?: boolean },
  ): void {
    const view = viewFor(state, detail, flags);

    // For re-entering `saved`, toggle animate off then on so the animation
    // replays on each successive save (requestAnimationFrame trick).
    if (state === 'saved' && view.animate) {
      const noAnimView = viewFor(state, detail, { ...flags, deepScanQueued: false });
      const tempView: ButtonView = { ...noAnimView, animate: false };
      render(tempView, currentHref);
      requestAnimationFrame(() => {
        render(view, currentHref);
      });
    } else {
      render(view, currentHref);
    }
  }

  function setHref(url: string | null): void {
    currentHref = url;
    // Re-render with the current view + new href
    const el = container.firstElementChild;
    if (el) {
      // Re-render using the existing class state
      const isSuccess = el.classList.contains('success');
      const isAnimate = el.classList.contains('animate');
      const state: SaveButtonState = isSuccess
        ? isAnimate
          ? 'saved'
          : 'already_saved'
        : 'idle';
      render(viewFor(state), currentHref);
    }
  }

  function unmount(): void {
    host.remove();
  }

  return { setView, setHref, unmount };
}
