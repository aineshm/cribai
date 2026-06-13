/**
 * Type-safe message contract between popup, service worker, and content scripts.
 *
 * All messages are discriminated unions — add new message types here to keep
 * the contract in one place.
 */

// ---------------------------------------------------------------------------
// Popup → Service Worker
// ---------------------------------------------------------------------------

export type PopupToSwMessage =
  | { readonly type: 'SIGN_IN'; readonly email: string }
  | { readonly type: 'VERIFY_OTP'; readonly email: string; readonly token: string }
  | { readonly type: 'SIGN_OUT' }
  | { readonly type: 'SAVE_LISTING' }
  | { readonly type: 'GET_AUTH_STATE' };

// ---------------------------------------------------------------------------
// Service Worker → Popup (responses)
// ---------------------------------------------------------------------------

export type AuthState =
  | { readonly status: 'signed_in'; readonly email: string }
  | { readonly status: 'signed_out' }
  | { readonly status: 'loading' }
  /**
   * OTP was sent in a previous popup open; user closed before entering the code.
   * The popup should resume at the OTP view pre-filled with this email.
   */
  | { readonly status: 'pending_otp'; readonly email: string };

export type SwResponse =
  | { readonly type: 'AUTH_STATE'; readonly state: AuthState }
  | { readonly type: 'SIGN_IN_OK'; readonly email: string }
  | { readonly type: 'OTP_SENT' }
  | { readonly type: 'SIGN_OUT_OK' }
  | {
      readonly type: 'SAVE_OK';
      readonly listingId?: string;
      readonly deepLinkUrl: string;
      readonly deepScanQueued?: boolean;
    }
  | { readonly type: 'ERROR'; readonly code: string; readonly message: string };

// ---------------------------------------------------------------------------
// Service Worker → Content Script (inject command)
// ---------------------------------------------------------------------------

export type SwToContentMessage =
  | { readonly type: 'CAPTURE_PAGE' };

// ---------------------------------------------------------------------------
// Content Script → Service Worker (capture result)
// ---------------------------------------------------------------------------

export interface CapturedIframe {
  readonly src: string;
  readonly html: string;
}

export type ContentToSwMessage =
  | {
      readonly type: 'PAGE_CAPTURED';
      readonly html: string;
      readonly sourceUrl: string;
      readonly title: string;
      readonly innerText?: string;
      readonly iframes?: readonly CapturedIframe[];
    }
  | { readonly type: 'CAPTURE_ERROR'; readonly message: string };
