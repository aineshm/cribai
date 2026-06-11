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
import { checkHtmlSize, assemblePayload, postIngest } from '../lib/ingest';
import { API_BASE, APP_DOMAIN, MY_APARTMENTS_PATH } from '../config/constants';
import type {
  PopupToSwMessage,
  SwResponse,
  AuthState,
  ContentToSwMessage,
} from '../lib/messages';

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

  if (!session?.user?.email) {
    return { status: 'signed_out' };
  }
  return { status: 'signed_in', email: session.user.email };
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

    // Fan-out: content-script capture result
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
      const email = data.user?.email ?? msg.email;
      return { type: 'SIGN_IN_OK', email };
    }

    case 'SIGN_OUT': {
      await supabase.auth.signOut();
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

      // 5. Assemble and POST
      const payload = assemblePayload({
        html: captureResult.html,
        sourceUrl: captureResult.sourceUrl,
        title: captureResult.title,
      });

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
      return { type: 'SAVE_OK', listingId: result.listingId, deepLinkUrl };
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

/**
 * Inline capture function — injected into the page via executeScript.
 *
 * MUST be a self-contained function with no closure references.
 * chrome.runtime IS available in injected scripts (MV3).
 */
function captureAndSendInline(): void {
  try {
    const html = document.documentElement.outerHTML;
    const sourceUrl = location.href;
    const title = document.title;

    chrome.runtime.sendMessage({
      type: 'PAGE_CAPTURED',
      html,
      sourceUrl,
      title,
    });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      message: err instanceof Error ? err.message : 'Unknown capture error',
    });
  }
}
