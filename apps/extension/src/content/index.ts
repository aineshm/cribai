/**
 * CribAI in-page save button — content script entry (AIN-72).
 *
 * Injected as a declared content script on curated listing domains. Mounts
 * a floating "Save to CribAI" button as a shadow-DOM component on listing
 * detail pages; hides on non-detail pages and handles SPA navigation.
 *
 * IMPORTANT: This file is compiled as an IIFE (not an ES module) — it is
 * loaded by Chrome as a classic script. All module dependencies are bundled
 * into the single output file `content.js` via vite.content.config.ts.
 */

import { findCuratedDomain, isDetailPage } from '../config/curated-domains';
import { createSaveButton } from './save-button';
import { capturePage } from './capture-page';
import { createSavedResetController } from './saved-reset-timer';
import { shouldRemount } from './navigation-compare';
import { isExtensionContextAlive, safeSendMessage } from './runtime-guard';
import type { SaveButtonState } from './state-machine';
import type { PageCapture } from './capture-page';
import type { SwResponse } from '../lib/messages';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Guard: only allow https:// deep-link URLs through to setHref. */
function isHttpsUrl(url: string): boolean {
  return url.startsWith('https://');
}

// ---------------------------------------------------------------------------
// SPA navigation — poll location.href every 1500ms
// ---------------------------------------------------------------------------

/** Track mounted state so we don't double-mount on SPA navigations. */
let currentHref = location.href;
let unmountFn: (() => void) | null = null;
/** Elevated so unmount() can cancel the in-flight analyzing timer on SPA nav. */
let analyzingTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// AIN-98: extension-context-invalidated teardown
//
// A reload/update/uninstall leaves this script running in any already-open
// tab with a dead `chrome.runtime` — `sendMessage` throws synchronously and
// nothing ever stopped the 1.5s poll interval before this guard. `teardown()`
// is idempotent (safe to call from both the poll tick and either
// `sendMessage` failure) and permanent: once stopped, this script never
// mounts, polls, or sends a message again for the rest of the tab's life.
// ---------------------------------------------------------------------------
let stopped = false;
/**
 * Assigned once the poll interval starts (bootstrap, bottom of this file).
 * Declared here (not `const` at the bootstrap site) so `teardown()` can
 * reference it even if it fires from a synchronous `sendMessage` failure
 * during the VERY FIRST `mount()` call, before the interval exists yet.
 */
let navIntervalId: ReturnType<typeof setInterval> | undefined;

function teardown(): void {
  if (stopped) return;
  stopped = true;
  if (navIntervalId !== undefined) clearInterval(navIntervalId);
  unmount();
}

function mount(): void {
  if (stopped) return; // AIN-98: extension context already invalidated — never mount again.

  const domain = findCuratedDomain(location.hostname);
  if (!domain || !isDetailPage(domain, new URL(location.href))) {
    return;
  }

  if (unmountFn) return; // already mounted

  let state: SaveButtonState = 'idle';
  let deepLinkUrl: string | undefined;

  const handle = createSaveButton(document, handleClick);

  // AIN-98: the post-save "Added to CribAI" state auto-reverts to resting
  // after ~7s instead of staying pinned indefinitely. Re-checks `state` in
  // case something else already moved it on (defensive, mirrors the
  // analyzingTimer guard below) — never fires onto a stale view.
  const savedResetController = createSavedResetController(() => {
    if (state !== 'saved') return;
    state = 'idle';
    deepLinkUrl = undefined;
    handle.setView(state, undefined, undefined);
    handle.setHref(null);
  });

  unmountFn = () => {
    // Cancel any pending analyzing timer so it doesn't fire after we unmount.
    if (analyzingTimer !== null) {
      clearTimeout(analyzingTimer);
      analyzingTimer = null;
    }
    savedResetController.cancel();
    handle.unmount();
  };

  // Check if already saved
  safeSendMessage<{ type: 'CHECK_SAVED'; sourceUrl: string }, SwResponse | undefined>(
    chrome.runtime,
    { type: 'CHECK_SAVED', sourceUrl: location.href },
    (response) => {
      if (!response) return;
      if (response.type === 'AUTH_REQUIRED') {
        state = 'signed_out';
        handle.setView(state, undefined, undefined);
        return;
      }
      if (response.type === 'SAVED_STATE' && response.saved) {
        state = 'already_saved';
        deepLinkUrl =
          response.deepLinkUrl && isHttpsUrl(response.deepLinkUrl)
            ? response.deepLinkUrl
            : undefined;
        handle.setView(state, undefined, undefined);
        if (deepLinkUrl) handle.setHref(deepLinkUrl);
        else handle.setHref(null);
      }
    },
    teardown,
  );

  function handleClick(): void {
    if (state === 'already_saved' && deepLinkUrl) {
      // Already-saved click opens CRM — the button is wrapped in a link for this
      return;
    }

    if (state === 'saving' || state === 'analyzing') return; // in flight

    state = 'saving';
    handle.setView(state, undefined, undefined);

    // After 3s, show analyzing to indicate progress.
    // Timer is elevated to mount() scope so unmount() can cancel it.
    analyzingTimer = setTimeout(() => {
      analyzingTimer = null;
      if (state === 'saving') {
        state = 'analyzing';
        handle.setView(state, undefined, undefined);
      }
    }, 3_000);

    const capture = capturePage(document, location);
    safeSendMessage<{ type: 'CONTENT_SAVE_LISTING' } & PageCapture, SwResponse | undefined>(
      chrome.runtime,
      {
        type: 'CONTENT_SAVE_LISTING',
        html: capture.html,
        sourceUrl: capture.sourceUrl,
        title: capture.title,
        innerText: capture.innerText,
        iframes: capture.iframes,
      },
      (response) => {
        if (analyzingTimer !== null) {
          clearTimeout(analyzingTimer);
          analyzingTimer = null;
        }

        if (!response) {
          state = 'error';
          handle.setView(state, 'Extension disconnected — try reloading the page.', undefined);
          return;
        }

        if (response.type === 'AUTH_REQUIRED') {
          state = 'signed_out';
          handle.setView(
            state,
            'Click the CribAI icon in your toolbar to sign in first',
            undefined,
          );
          return;
        }

        if (response.type === 'SAVE_OK') {
          state = 'saved';
          deepLinkUrl =
            response.deepLinkUrl && isHttpsUrl(response.deepLinkUrl)
              ? response.deepLinkUrl
              : undefined;
          handle.setView(state, undefined, { deepScanQueued: response.deepScanQueued });
          if (deepLinkUrl) handle.setHref(deepLinkUrl);
          else handle.setHref(null);
          savedResetController.schedule();
          return;
        }

        if (response.type === 'ERROR') {
          state = 'error';
          handle.setView(state, response.message, undefined);
          return;
        }

        state = 'error';
        handle.setView(state, 'Unexpected response — please try again.', undefined);
      },
      teardown,
    );
  }
}

function unmount(): void {
  if (unmountFn) {
    unmountFn();
    unmountFn = null;
  }
}

function checkNavigation(): void {
  // AIN-98: check FIRST, before touching location.href or the DOM — a
  // reload/update/uninstall between ticks leaves this tab's `chrome.runtime`
  // dead; tearing down here (idempotent) stops the interval permanently
  // instead of polling (and potentially throwing) forever.
  if (!isExtensionContextAlive(chrome.runtime)) {
    teardown();
    return;
  }

  const newHref = location.href;
  if (newHref === currentHref) return;

  // AIN-98: a hash-only change (e.g. clicking a unit anchor on a Zillow
  // building page, `#udp-<zpid>`) is NOT a real navigation — the page's
  // identity (origin+pathname+search) is unchanged, so the save button's
  // state, the 7s saved-reset timer, and the in-flight analyzing timer must
  // all survive it. Update the tracked href so a later hash-only diff still
  // no-ops, but skip the unmount/remount dance entirely.
  if (!shouldRemount(currentHref, newHref)) {
    currentHref = newHref;
    return;
  }
  currentHref = newHref;

  const domain = findCuratedDomain(location.hostname);
  if (!domain || !isDetailPage(domain, new URL(newHref))) {
    unmount();
  } else {
    unmount(); // remount fresh on new detail page
    mount();
  }
}

// Bootstrap
mount();
// AIN-98 review fix (LOW): `mount()` can itself call `teardown()` synchronously
// (its CHECK_SAVED `safeSendMessage` call hits a context already dead on the
// very first tick — e.g. a stale tab from before this reload). `stopped` is
// true by the time we get here, but `navIntervalId` doesn't exist yet, so
// `teardown()`'s `clearInterval` was a no-op — starting the interval
// unconditionally right after would create a poll loop `teardown()` can
// never reach again (each tick's own `teardown()` call returns immediately
// via the `if (stopped) return;` guard, without ever clearing THIS interval).
// Only start polling when the context is confirmed still alive post-mount.
if (!stopped) {
  navIntervalId = setInterval(checkNavigation, 1_500);
}
// Clear the polling interval when the page is unloaded to avoid a leak.
window.addEventListener('pagehide', () => clearInterval(navIntervalId), { once: true });
