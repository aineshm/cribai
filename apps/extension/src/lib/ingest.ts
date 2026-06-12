/**
 * Ingest payload assembly and HTTP call logic.
 *
 * All pure functions in this module have no direct browser-API dependencies,
 * making them fully unit-testable with vitest.
 */

import { MAX_HTML_BYTES, MAX_PAYLOAD_BYTES, INGEST_PATH } from '../config/constants';
import type { CapturedIframe } from './messages';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapturedPage {
  readonly html: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly innerText?: string;
  readonly iframes?: readonly CapturedIframe[];
}

export interface IngestPayload {
  readonly html: string;
  readonly sourceUrl: string;
  readonly capturedAt: string;
  readonly innerText?: string;
  readonly iframes?: readonly CapturedIframe[];
}

export type IngestResultOk = {
  readonly ok: true;
  readonly listingId?: string;
  readonly deepScanQueued?: boolean;
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

/**
 * Returns byte length of a string as UTF-8.
 *
 * Uses TextEncoder when available (exact measurement). Falls back to
 * `s.length * 3` — a conservative over-estimate (safe: never under-counts
 * real UTF-8 size for valid BMP strings; 4-byte code-points are counted as 6
 * in the fallback, but those are rare and the over-estimate just causes earlier
 * trimming, never a missed limit).
 *
 * Exported so callers can reuse this single measurement consistently.
 */
export function utf8ByteLength(s: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(s).byteLength;
  }
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
 * Pure function — no side effects. title is dropped (not sent to server).
 */
export function assemblePayload(page: CapturedPage): IngestPayload {
  return {
    html: page.html,
    sourceUrl: page.sourceUrl,
    capturedAt: new Date().toISOString(),
    ...(page.innerText !== undefined ? { innerText: page.innerText } : {}),
    ...(page.iframes !== undefined ? { iframes: page.iframes } : {}),
  };
}

// ---------------------------------------------------------------------------
// Payload budget enforcement
// ---------------------------------------------------------------------------

function payloadBytes(p: IngestPayload): number {
  return utf8ByteLength(JSON.stringify(p));
}

/**
 * Shrink the payload to MAX_PAYLOAD_BYTES by dropping richer fields:
 * largest iframes first, then truncate innerText by halves. html is never touched
 * (it has its own MAX_HTML_BYTES guard upstream).
 *
 * FIX 9: omit empty fields rather than sending empty strings / empty arrays:
 *   - innerText is omitted (undefined) when trimmed to empty
 *   - iframes is omitted (undefined) when the kept list is empty
 */
export function fitPayloadToBudget(payload: IngestPayload): IngestPayload {
  let current = payload;
  if (payloadBytes(current) <= MAX_PAYLOAD_BYTES) return current;

  // Drop iframes largest-first until the payload fits
  const keptIframes = [...(current.iframes ?? [])].sort((a, b) => a.html.length - b.html.length);
  while (
    keptIframes.length > 0 &&
    payloadBytes({ ...current, iframes: keptIframes }) > MAX_PAYLOAD_BYTES
  ) {
    keptIframes.pop(); // drop the largest remaining
  }
  // Omit iframes field entirely when empty (don't send [])
  current = {
    ...current,
    iframes: keptIframes.length > 0 ? keptIframes : undefined,
  };

  // Truncate innerText by halves until budget satisfied
  let text = current.innerText ?? '';
  while (text.length > 0 && payloadBytes({ ...current, innerText: text }) > MAX_PAYLOAD_BYTES) {
    text = text.slice(0, Math.floor(text.length / 2));
  }
  // Omit innerText field entirely when empty (don't send "")
  return { ...current, innerText: text || undefined };
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
    const body = (await response.json()) as { listingId?: string; deepScanQueued?: boolean };
    return { ok: true, listingId: body.listingId, deepScanQueued: body.deepScanQueued };
  } catch {
    // 2xx with non-JSON body — still a success
    return { ok: true };
  }
}
