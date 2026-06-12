/**
 * Service worker (background script) for the CribAI extension.
 *
 * Responsibilities:
 * - Hold the authenticated Supabase session (chrome.storage.local)
 * - Handle popup messages: sign-in (OTP), OTP verification, sign-out, save
 * - When "save" is requested: inject the content script, receive the captured
 *   HTML, size-check it, and POST to /api/crm/ingest
 *
 * Auth method: magic-link OTP (signInWithOtp → verifyOtp)
 * Rationale: this is what the web app already uses; no password storage needed;
 * works for any email including non-.edu accounts (the ingest route enforces
 * its own access controls).
 */

import { getSupabaseClient } from './supabase-client';
import { checkHtmlSize, assemblePayload, fitPayloadToBudget, postIngest } from '../lib/ingest';
import { isCapturableUrl, NON_CAPTURABLE_MESSAGE } from '../lib/capturable-url';
import { API_BASE, APP_DOMAIN, MY_APARTMENTS_PATH } from '../config/constants';
import { createPendingAuthStore } from '../lib/pending-auth-store';
import { findCuratedDomain, isDetailPage } from '../config/curated-domains';
import type {
  PopupToSwMessage,
  SwResponse,
  AuthState,
  ContentToSwMessage,
  ContentSaveMessage,
} from '../lib/messages';

// ---------------------------------------------------------------------------
// Curated-URL guard (AIN-72) — used to validate CONTENT_SAVE_LISTING and
// CHECK_SAVED senders. Defense-in-depth: the manifest content_scripts.matches
// already limits injection to curated domains; this guard re-validates the
// sender URL in the SW so a compromised or mis-declared page can't abuse the
// ingest endpoint.
// ---------------------------------------------------------------------------

/**
 * Returns true when the given URL belongs to a curated listing domain AND
 * is an http(s) page (i.e. capturable). Non-curated URLs are rejected so
 * the ingest path is never called from an unexpected origin.
 */
export function isCuratedUrl(url: string): boolean {
  if (!isCapturableUrl(url)) return false;
  try {
    const parsed = new URL(url);
    const domain = findCuratedDomain(parsed.hostname);
    return domain !== undefined && isDetailPage(domain, parsed);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// PendingAuth store — persists mid-OTP state across popup close/reopen
// ---------------------------------------------------------------------------

const pendingAuthStore = createPendingAuthStore();

// ---------------------------------------------------------------------------
// Pending capture: the popup triggers a save, the service worker injects the
// content script, and awaits the PAGE_CAPTURED message. We store the resolve
// callback and the tab id so the message listener can verify origin + fulfill.
// ---------------------------------------------------------------------------

type CaptureResolve = (msg: ContentToSwMessage) => void;
let pendingCapture: CaptureResolve | null = null;
/** Tab id that initiated the current capture — used for content-sender validation. */
let pendingCaptureTabId: number | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthState(): Promise<AuthState> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user?.email) {
    return { status: 'signed_in', email: session.user.email };
  }

  // Not signed in — check whether an OTP is in-flight from a previous popup open.
  const pendingEmail = await pendingAuthStore.read();
  if (pendingEmail !== null) {
    return { status: 'pending_otp', email: pendingEmail };
  }

  return { status: 'signed_out' };
}

/**
 * Validates the email against the web app's server-side gate before calling
 * signInWithOtp. Matches the request/response contract of
 * apps/web/app/api/auth/validate-email/route.ts and AuthForm.tsx.
 *
 * Returns undefined on success; an error string on failure; null on network error.
 */
async function validateEmailWithServer(email: string): Promise<string | null | undefined> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/validate-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const body = (await res.json()) as { valid?: boolean; error?: string };
    if (!body.valid) {
      return body.error ?? 'Email not allowed.';
    }
    return undefined; // success
  } catch {
    return null; // network error — null distinguishes from rejection string
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    rawMessage: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: SwResponse) => void,
  ): boolean => {
    // Security: reject messages from outside this extension entirely.
    if (sender.id !== chrome.runtime.id) {
      sendResponse({
        type: 'ERROR',
        code: 'invalid',
        message: 'Untrusted sender.',
      });
      return false;
    }

    // Fan-out: content-script capture result (popup-triggered executeScript path)
    const contentMsg = rawMessage as ContentToSwMessage;
    if (
      contentMsg.type === 'PAGE_CAPTURED' ||
      contentMsg.type === 'CAPTURE_ERROR'
    ) {
      // Security: verify that the message comes from the tab that initiated capture.
      if (pendingCaptureTabId === null || sender.tab?.id !== pendingCaptureTabId) {
        // Discard messages from unexpected tabs silently — do not close the channel.
        return false;
      }
      if (pendingCapture) {
        pendingCapture(contentMsg);
        pendingCapture = null;
        pendingCaptureTabId = null;
      }
      return false;
    }

    // Fan-out: in-page save button messages (AIN-72 declared content scripts)
    const contentSaveMsg = rawMessage as ContentSaveMessage;
    if (
      contentSaveMsg.type === 'CONTENT_SAVE_LISTING' ||
      contentSaveMsg.type === 'CHECK_SAVED'
    ) {
      // Security: sender must be from this extension, have a tab, and come
      // from a curated listing URL. Defense-in-depth on top of the manifest
      // content_scripts.matches restriction.
      const senderUrl = sender.url ?? '';
      if (
        sender.id !== chrome.runtime.id ||
        sender.tab?.id == null ||
        !isCuratedUrl(senderUrl)
      ) {
        sendResponse({
          type: 'ERROR',
          code: 'invalid',
          message: 'Untrusted sender.',
        });
        return false;
      }

      handleContentSaveMessage(contentSaveMsg)
        .then(sendResponse)
        .catch((err: unknown) => {
          sendResponse({
            type: 'ERROR',
            code: 'unexpected',
            message: err instanceof Error ? err.message : 'Unexpected error',
          });
        });
      return true; // keep channel open for async response
    }

    // Popup messages
    const msg = rawMessage as PopupToSwMessage;

    handlePopupMessage(msg)
      .then(sendResponse)
      .catch((err: unknown) => {
        sendResponse({
          type: 'ERROR',
          code: 'unexpected',
          message: err instanceof Error ? err.message : 'Unexpected error',
        });
      });

    return true; // keep channel open for async response
  },
);

async function handlePopupMessage(msg: PopupToSwMessage): Promise<SwResponse> {
  const supabase = getSupabaseClient();

  switch (msg.type) {
    case 'GET_AUTH_STATE': {
      const state = await getAuthState();
      return { type: 'AUTH_STATE', state };
    }

    case 'SIGN_IN': {
      // Security: validate email against the web app's server-side gate before
      // calling signInWithOtp, matching the AuthForm.tsx flow exactly.
      const validationError = await validateEmailWithServer(msg.email);
      if (validationError === null) {
        // Network error during validation — surface a user-friendly message.
        return {
          type: 'ERROR',
          code: 'auth',
          message: 'Unable to validate email. Please check your connection and try again.',
        };
      }
      if (validationError !== undefined) {
        // Server rejected the email.
        return { type: 'ERROR', code: 'auth', message: validationError };
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: msg.email,
        options: { shouldCreateUser: true },
      });
      if (error) {
        return { type: 'ERROR', code: 'auth', message: error.message };
      }
      // OTP sent — persist so the popup can resume at the OTP step after close/reopen.
      await pendingAuthStore.persist(msg.email);
      return { type: 'OTP_SENT' };
    }

    case 'VERIFY_OTP': {
      const { data, error } = await supabase.auth.verifyOtp({
        email: msg.email,
        token: msg.token,
        type: 'email',
      });
      if (error) {
        return { type: 'ERROR', code: 'auth', message: error.message };
      }
      // Verification succeeded — pendingAuth is no longer needed.
      await pendingAuthStore.clear();
      const email = data.user?.email ?? msg.email;
      return { type: 'SIGN_IN_OK', email };
    }

    case 'SIGN_OUT': {
      await supabase.auth.signOut();
      // Clear any in-flight OTP state on explicit sign-out.
      await pendingAuthStore.clear();
      return { type: 'SIGN_OUT_OK' };
    }

    case 'SAVE_LISTING': {
      // 1. Verify the user is authenticated
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        return {
          type: 'ERROR',
          code: 'auth',
          message: 'Please sign in to save listings.',
        };
      }

      // 2. Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        return {
          type: 'ERROR',
          code: 'invalid',
          message: 'No active tab found.',
        };
      }

      // 2a. Preflight: only http/https pages accept content-script injection.
      //     chrome://, about:, file://, chrome-extension://, edge://, etc. all
      //     throw a raw Chrome error from executeScript. Short-circuit here with
      //     a friendly message instead of leaking "Cannot access a chrome:// URL".
      if (!isCapturableUrl(tab.url)) {
        return {
          type: 'ERROR',
          code: 'invalid',
          message: NON_CAPTURABLE_MESSAGE,
        };
      }

      // 3. Inject content script and await capture (with 15s timeout so the
      //    popup never freezes if the injected function's sendMessage is lost).
      const captureTabId = tab.id;
      const captureResult = await new Promise<ContentToSwMessage>((resolve) => {
        pendingCapture = resolve;
        pendingCaptureTabId = captureTabId;

        // Timeout: if the content-script message never arrives, resolve as error.
        const timeoutId = setTimeout(() => {
          if (pendingCapture) {
            pendingCapture({
              type: 'CAPTURE_ERROR',
              message: 'Capture timed out',
            });
            pendingCapture = null;
            pendingCaptureTabId = null;
          }
        }, 15_000);

        chrome.scripting
          .executeScript({
            target: { tabId: captureTabId },
            func: captureAndSendInline,
          })
          .catch((err: unknown) => {
            clearTimeout(timeoutId);
            if (pendingCapture) {
              pendingCapture({
                type: 'CAPTURE_ERROR',
                message: err instanceof Error ? err.message : 'Script injection failed',
              });
              pendingCapture = null;
              pendingCaptureTabId = null;
            }
          });
      });

      if (captureResult.type === 'CAPTURE_ERROR') {
        return {
          type: 'ERROR',
          code: 'invalid',
          message: `Failed to capture page: ${captureResult.message}`,
        };
      }

      // 4. Client-side size guard
      const sizeCheck = checkHtmlSize(captureResult.html);
      if (!sizeCheck.ok) {
        const mb = (sizeCheck.byteLength / 1024 / 1024).toFixed(1);
        return {
          type: 'ERROR',
          code: 'too_large',
          message: `This page is too large to save (${mb} MB). Try a simpler listing page.`,
        };
      }

      // 5. Assemble, fit to budget, and POST
      const rawPayload = assemblePayload({
        html: captureResult.html,
        sourceUrl: captureResult.sourceUrl,
        title: captureResult.title,
        innerText: captureResult.innerText,
        iframes: captureResult.iframes,
      });
      const payload = fitPayloadToBudget(rawPayload);

      const result = await postIngest(API_BASE, session.access_token, payload);

      if (!result.ok) {
        // 401 → clear session so popup can prompt re-auth
        if (result.code === 'auth') {
          await supabase.auth.signOut();
        }
        return {
          type: 'ERROR',
          code: result.code,
          message: result.message,
        };
      }

      const deepLinkUrl = `${APP_DOMAIN}${MY_APARTMENTS_PATH}`;
      return { type: 'SAVE_OK', listingId: result.listingId, deepLinkUrl, deepScanQueued: result.deepScanQueued };
    }

    default: {
      // Exhaustiveness check — TypeScript will flag unhandled cases at compile time
      const _exhaustive: never = msg;
      return {
        type: 'ERROR',
        code: 'invalid',
        message: `Unknown message type: ${String((_exhaustive as { type: string }).type)}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Content-save handlers (AIN-72 in-page button)
// ---------------------------------------------------------------------------

/**
 * Handle CONTENT_SAVE_LISTING and CHECK_SAVED messages from the declared
 * content script. Called after sender validation in the message listener.
 */
async function handleContentSaveMessage(msg: ContentSaveMessage): Promise<SwResponse> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { type: 'AUTH_REQUIRED' };
  }

  if (msg.type === 'CHECK_SAVED') {
    // Fail-open: network errors degrade to idle (never block the button).
    try {
      const res = await fetch(
        `${API_BASE}/api/crm/saved?sourceUrl=${encodeURIComponent(msg.sourceUrl)}`,
        { headers: { authorization: `Bearer ${session.access_token}` } },
      );
      if (!res.ok) {
        return { type: 'SAVED_STATE', saved: false };
      }
      const body = (await res.json()) as { saved?: boolean; listingId?: string };
      const deepLinkUrl = body.saved ? `${APP_DOMAIN}${MY_APARTMENTS_PATH}` : undefined;
      return {
        type: 'SAVED_STATE',
        saved: Boolean(body.saved),
        listingId: body.listingId,
        deepLinkUrl,
      };
    } catch {
      // Fail open — degrade to idle so the button is still usable
      return { type: 'SAVED_STATE', saved: false };
    }
  }

  // CONTENT_SAVE_LISTING
  const sizeCheck = checkHtmlSize(msg.html);
  if (!sizeCheck.ok) {
    const mb = (sizeCheck.byteLength / 1024 / 1024).toFixed(1);
    return {
      type: 'ERROR',
      code: 'too_large',
      message: `This page is too large to save (${mb} MB). Try a simpler listing page.`,
    };
  }

  const rawPayload = assemblePayload({
    html: msg.html,
    sourceUrl: msg.sourceUrl,
    title: msg.title,
    innerText: msg.innerText,
    iframes: msg.iframes,
  });
  const payload = fitPayloadToBudget(rawPayload);

  const result = await postIngest(API_BASE, session.access_token, payload);

  if (!result.ok) {
    if (result.code === 'auth') {
      await supabase.auth.signOut();
      return { type: 'AUTH_REQUIRED' };
    }
    return { type: 'ERROR', code: result.code, message: result.message };
  }

  const deepLinkUrl = `${APP_DOMAIN}${MY_APARTMENTS_PATH}`;
  return {
    type: 'SAVE_OK',
    listingId: result.listingId,
    deepLinkUrl,
    deepScanQueued: result.deepScanQueued,
  };
}

/**
 * Inline capture function — injected into the page via executeScript.
 *
 * MUST be a self-contained function with no closure references.
 * Caps are inlined as literals because an injected function cannot import
 * from module scope. Each literal MUST stay in sync with its constants.ts name:
 *
 *   200_000  → MAX_INNER_TEXT_CHARS  (constants.ts)
 *   10       → MAX_IFRAMES           (constants.ts)
 *   524_288  → MAX_IFRAME_HTML_CHARS (constants.ts)
 *
 * If you change a constant, update BOTH constants.ts AND the literal here.
 *
 * chrome.runtime IS available in injected scripts (MV3).
 */
function captureAndSendInline(): void {
  try {
    const html = document.documentElement.outerHTML;
    const innerText = (document.body ? document.body.innerText : '').slice(0, 200_000); // MAX_INNER_TEXT_CHARS
    const iframes: Array<{ src: string; html: string }> = [];
    const frames = document.querySelectorAll('iframe');
    for (let i = 0; i < frames.length && iframes.length < 10; i++) { // 10 = MAX_IFRAMES
      try {
        const doc = frames[i]!.contentDocument; // throws/null when cross-origin
        const root = doc && doc.documentElement;
        if (root) {
          iframes.push({ src: frames[i]!.src || '', html: root.outerHTML.slice(0, 524_288) }); // 524_288 = MAX_IFRAME_HTML_CHARS
        }
      } catch {
        // cross-origin iframe — invisible to us by design; the deep-extract mission covers it
      }
    }
    chrome.runtime.sendMessage({
      type: 'PAGE_CAPTURED',
      html,
      sourceUrl: location.href,
      title: document.title,
      innerText,
      iframes,
    });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      message: err instanceof Error ? err.message : 'Unknown capture error',
    });
  }
}
