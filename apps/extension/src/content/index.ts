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
import type { SaveButtonState } from './state-machine';
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

function mount(): void {
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
  chrome.runtime.sendMessage(
    { type: 'CHECK_SAVED', sourceUrl: location.href },
    (response: SwResponse | undefined) => {
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
    chrome.runtime.sendMessage(
      {
        type: 'CONTENT_SAVE_LISTING',
        html: capture.html,
        sourceUrl: capture.sourceUrl,
        title: capture.title,
        innerText: capture.innerText,
        iframes: capture.iframes,
      },
      (response: SwResponse | undefined) => {
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
  const newHref = location.href;
  if (newHref === currentHref) return;
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
const navIntervalId = setInterval(checkNavigation, 1_500);
// Clear the polling interval when the page is unloaded to avoid a leak.
window.addEventListener('pagehide', () => clearInterval(navIntervalId), { once: true });
