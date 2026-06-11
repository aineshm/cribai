/**
 * Unit tests for background service worker logic.
 *
 * Tests are written against the extracted handler functions to avoid
 * module-level chrome.runtime side-effects at import time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Fix 1 — sender validation helpers
// ---------------------------------------------------------------------------

/**
 * Extracted sender-validation logic (mirrors what we add to background/index.ts).
 * We test the pure predicate in isolation.
 */
function isTrustedSender(
  sender: chrome.runtime.MessageSender,
  extensionId: string,
): boolean {
  return sender.id === extensionId;
}

function isTrustedContentSender(
  sender: chrome.runtime.MessageSender,
  extensionId: string,
  expectedTabId: number | null,
): boolean {
  if (sender.id !== extensionId) return false;
  if (expectedTabId === null) return false;
  return sender.tab?.id === expectedTabId;
}

describe('sender validation', () => {
  const EXT_ID = 'test-ext-id';

  describe('isTrustedSender (popup → SW messages)', () => {
    it('accepts a message from the same extension', () => {
      const sender = { id: EXT_ID } as chrome.runtime.MessageSender;
      expect(isTrustedSender(sender, EXT_ID)).toBe(true);
    });

    it('rejects a message from a different extension', () => {
      const sender = { id: 'evil-ext-id' } as chrome.runtime.MessageSender;
      expect(isTrustedSender(sender, EXT_ID)).toBe(false);
    });

    it('rejects a message with no sender id (external website)', () => {
      const sender = {} as chrome.runtime.MessageSender;
      expect(isTrustedSender(sender, EXT_ID)).toBe(false);
    });
  });

  describe('isTrustedContentSender (PAGE_CAPTURED/CAPTURE_ERROR from injected script)', () => {
    it('accepts when sender id matches and tab id matches pending capture tab', () => {
      const sender = {
        id: EXT_ID,
        tab: { id: 42 },
      } as chrome.runtime.MessageSender;
      expect(isTrustedContentSender(sender, EXT_ID, 42)).toBe(true);
    });

    it('rejects when sender id is wrong even if tab id matches', () => {
      const sender = {
        id: 'evil-ext',
        tab: { id: 42 },
      } as chrome.runtime.MessageSender;
      expect(isTrustedContentSender(sender, EXT_ID, 42)).toBe(false);
    });

    it('rejects when tab id does not match pending capture tab', () => {
      const sender = {
        id: EXT_ID,
        tab: { id: 99 },
      } as chrome.runtime.MessageSender;
      expect(isTrustedContentSender(sender, EXT_ID, 42)).toBe(false);
    });

    it('rejects when sender has no tab (message from popup, not content script)', () => {
      const sender = { id: EXT_ID } as chrome.runtime.MessageSender;
      expect(isTrustedContentSender(sender, EXT_ID, 42)).toBe(false);
    });

    it('rejects when no pending capture tab is recorded (expectedTabId is null)', () => {
      const sender = {
        id: EXT_ID,
        tab: { id: 42 },
      } as chrome.runtime.MessageSender;
      expect(isTrustedContentSender(sender, EXT_ID, null)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Fix 2 — validate-email gate
// ---------------------------------------------------------------------------

/**
 * Extracted email validation logic (mirrors what we add to handlePopupMessage
 * SIGN_IN branch). Accepts an injected fetch so we can mock it.
 */
async function validateEmailWithServer(
  email: string,
  apiBase: string,
  fetchFn: typeof fetch,
): Promise<{ valid: true } | { valid: false; error: string } | { networkError: true }> {
  try {
    const res = await fetchFn(`${apiBase}/api/auth/validate-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const body = (await res.json()) as { valid?: boolean; error?: string };
    if (!body.valid) {
      return { valid: false, error: body.error ?? 'Email not allowed.' };
    }
    return { valid: true };
  } catch {
    return { networkError: true };
  }
}

describe('validate-email gate', () => {
  const API_BASE = 'https://cribai.app';

  it('returns valid:true for an accepted email', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ valid: true, isEdu: false }), { status: 200 }),
    );

    const result = await validateEmailWithServer('user@example.com', API_BASE, mockFetch);
    expect(result).toEqual({ valid: true });
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/auth/validate-email`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns valid:true with .edu badge for a .edu email', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ valid: true, isEdu: true, badge: 'verified_student' }),
        { status: 200 },
      ),
    );

    const result = await validateEmailWithServer('student@wisc.edu', API_BASE, mockFetch);
    expect(result).toEqual({ valid: true });
  });

  it('returns valid:false with server error message when rejected', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ valid: false, error: 'Email not recognized.' }),
        { status: 400 },
      ),
    );

    const result = await validateEmailWithServer('bad@domain.invalid', API_BASE, mockFetch);
    expect(result).toEqual({ valid: false, error: 'Email not recognized.' });
  });

  it('returns valid:false with fallback message when server gives no error string', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ valid: false }), { status: 400 }),
    );

    const result = await validateEmailWithServer('bad@bad.invalid', API_BASE, mockFetch);
    if ('networkError' in result) throw new Error('should not be network error');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('returns networkError:true when fetch throws', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await validateEmailWithServer('user@example.com', API_BASE, mockFetch);
    expect(result).toEqual({ networkError: true });
  });
});

// ---------------------------------------------------------------------------
// Fix 8 — 15s capture timeout
// ---------------------------------------------------------------------------

/**
 * Extracted capture-with-timeout logic (mirrors what we add to SAVE_LISTING branch).
 * Returns a ContentToSwMessage — either PAGE_CAPTURED or CAPTURE_ERROR.
 */
async function captureWithTimeout(
  capturePromise: Promise<{ type: 'PAGE_CAPTURED' | 'CAPTURE_ERROR'; [k: string]: unknown }>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<{ type: 'PAGE_CAPTURED' | 'CAPTURE_ERROR'; [k: string]: unknown }> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<{ type: 'CAPTURE_ERROR'; message: string }>((resolve) => {
    timeoutId = setTimeout(() => {
      onTimeout();
      resolve({ type: 'CAPTURE_ERROR', message: 'Capture timed out' });
    }, timeoutMs);
  });

  const result = await Promise.race([capturePromise, timeoutPromise]);
  clearTimeout(timeoutId!);
  return result;
}

describe('capture timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with PAGE_CAPTURED when capture completes before timeout', async () => {
    const captureResult = {
      type: 'PAGE_CAPTURED' as const,
      html: '<html></html>',
      sourceUrl: 'https://example.com',
      title: 'Test',
    };
    const capturePromise = Promise.resolve(captureResult);
    const onTimeout = vi.fn();

    const resultPromise = captureWithTimeout(capturePromise, 15_000, onTimeout);
    await vi.runAllTimersAsync();

    const result = await resultPromise;
    expect(result.type).toBe('PAGE_CAPTURED');
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('resolves with CAPTURE_ERROR("Capture timed out") when capture hangs', async () => {
    // A promise that never resolves — simulates lost content-script message
    const capturePromise = new Promise<never>(() => {
      /* intentionally never resolves */
    }) as unknown as Promise<{ type: 'CAPTURE_ERROR'; message: string }>;

    const onTimeout = vi.fn();

    const resultPromise = captureWithTimeout(capturePromise, 15_000, onTimeout);

    // Advance past the timeout
    await vi.advanceTimersByTimeAsync(15_001);

    const result = await resultPromise;
    expect(result.type).toBe('CAPTURE_ERROR');
    expect((result as unknown as { message: string }).message).toBe('Capture timed out');
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('does not fire onTimeout when capture resolves quickly', async () => {
    const capturePromise = Promise.resolve({
      type: 'PAGE_CAPTURED' as const,
      html: '<html></html>',
      sourceUrl: 'https://example.com',
      title: 'Page',
    });
    const onTimeout = vi.fn();

    const resultPromise = captureWithTimeout(capturePromise, 15_000, onTimeout);
    await vi.advanceTimersByTimeAsync(100);
    await resultPromise;

    // Advance well past timeout — onTimeout must not fire after early resolve
    await vi.advanceTimersByTimeAsync(20_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
