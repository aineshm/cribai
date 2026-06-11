/**
 * Ingest payload assembly and HTTP call logic.
 *
 * All pure functions in this module have no direct browser-API dependencies,
 * making them fully unit-testable with vitest.
 */

import { MAX_HTML_BYTES, INGEST_PATH } from '../config/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapturedPage {
  readonly html: string;
  readonly sourceUrl: string;
  readonly title: string;
}

export interface IngestPayload {
  readonly html: string;
  readonly sourceUrl: string;
  readonly capturedAt: string;
}

export type IngestResultOk = {
  readonly ok: true;
  readonly listingId?: string;
};

export type IngestResultErr = {
  readonly ok: false;
  readonly code: 'too_large' | 'auth' | 'rate_limited' | 'invalid' | 'server' | 'network';
  readonly message: string;
  /** ISO timestamp — set for rate_limited so UI can show a retry hint */
  readonly retryAfter?: string;
};

export type IngestResult = IngestResultOk | IngestResultErr;

// ---------------------------------------------------------------------------
// Size guard
// ---------------------------------------------------------------------------

/** Returns byte length of a UTF-16 string as UTF-8. */
function utf8ByteLength(s: string): number {
  // TextEncoder not available in all test envs — fall back to a worst-case estimate
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(s).byteLength;
  }
  // 3 bytes per character is a safe upper bound for BMP characters
  return s.length * 3;
}

export type SizeGuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly byteLength: number; readonly maxBytes: number };

/**
 * Validates that the HTML payload will not exceed the server's 4 MiB limit.
 * Call this before sending; surface the error to the user immediately.
 */
export function checkHtmlSize(html: string, maxBytes = MAX_HTML_BYTES): SizeGuardResult {
  const byteLength = utf8ByteLength(html);
  if (byteLength > maxBytes) {
    return { ok: false, byteLength, maxBytes };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Payload assembly
// ---------------------------------------------------------------------------

/**
 * Assembles the ingest request body from a captured page.
 * Pure function — no side effects.
 */
export function assemblePayload(page: CapturedPage): IngestPayload {
  return {
    html: page.html,
    sourceUrl: page.sourceUrl,
    capturedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// HTTP call
// ---------------------------------------------------------------------------

/**
 * Sends the ingest payload to the CribAI API.
 *
 * @param apiBase - Base URL (e.g. https://cribai.app) — injected for testability
 * @param accessToken - Supabase JWT access token
 * @param payload - Pre-assembled ingest body
 * @param fetchFn - Injected fetch (defaults to globalThis.fetch)
 */
export async function postIngest(
  apiBase: string,
  accessToken: string,
  payload: IngestPayload,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<IngestResult> {
  const url = `${apiBase}${INGEST_PATH}`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      ok: false,
      code: 'network',
      message: 'Network error — check your connection and try again.',
    };
  }

  if (response.status === 401) {
    return {
      ok: false,
      code: 'auth',
      message: 'Your session expired. Please sign in again.',
    };
  }

  if (response.status === 413) {
    return {
      ok: false,
      code: 'too_large',
      message: 'This page is too large to save (over 4 MB). Try a simpler listing page.',
    };
  }

  if (response.status === 400) {
    let detail = 'The page could not be processed. Try a different listing page.';
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // ignore parse errors
    }
    return { ok: false, code: 'invalid', message: detail };
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfter = retryAfterHeader
      ? new Date(Date.now() + parseInt(retryAfterHeader, 10) * 1000).toISOString()
      : undefined;
    return {
      ok: false,
      code: 'rate_limited',
      message: 'You have saved too many listings recently. Please wait a moment and try again.',
      retryAfter,
    };
  }

  if (response.status >= 500) {
    return {
      ok: false,
      code: 'server',
      message: 'CribAI is having trouble right now. Please try again in a moment.',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: 'server',
      message: `Unexpected response from server (${response.status}).`,
    };
  }

  try {
    const body = (await response.json()) as { listingId?: string };
    return { ok: true, listingId: body.listingId };
  } catch {
    // 2xx with non-JSON body — still a success
    return { ok: true };
  }
}
