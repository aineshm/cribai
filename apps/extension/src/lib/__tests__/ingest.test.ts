/**
 * Unit tests for ingest.ts — pure logic, no browser APIs required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkHtmlSize,
  assemblePayload,
  postIngest,
  fitPayloadToBudget,
  type CapturedPage,
  type IngestPayload,
} from '../ingest';

// ---------------------------------------------------------------------------
// checkHtmlSize
// ---------------------------------------------------------------------------

describe('checkHtmlSize', () => {
  it('returns ok:true when html is within limit', () => {
    const html = 'a'.repeat(100);
    const result = checkHtmlSize(html, 1000);
    expect(result.ok).toBe(true);
  });

  it('returns ok:false when html exceeds limit', () => {
    const html = 'a'.repeat(1001);
    const result = checkHtmlSize(html, 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.maxBytes).toBe(1000);
      expect(result.byteLength).toBeGreaterThan(1000);
    }
  });

  it('returns ok:true at exactly the limit', () => {
    // ASCII: 1 byte per char
    const html = 'a'.repeat(4 * 1024 * 1024);
    const result = checkHtmlSize(html);
    expect(result.ok).toBe(true);
  });

  it('returns ok:false for HTML exceeding 4MiB default', () => {
    // 4MiB + 1 byte
    const html = 'a'.repeat(4 * 1024 * 1024 + 1);
    const result = checkHtmlSize(html);
    expect(result.ok).toBe(false);
  });

  it('handles multi-byte UTF-8 characters correctly', () => {
    // Each emoji is 4 bytes in UTF-8
    const emoji = '\u{1F600}'; // 😀
    const html = emoji.repeat(10);
    // 10 emojis * 4 bytes = 40 bytes
    const result = checkHtmlSize(html, 39);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assemblePayload
// ---------------------------------------------------------------------------

describe('assemblePayload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T10:00:00.000Z'));
  });

  it('builds a valid payload from captured page data', () => {
    const page: CapturedPage = {
      html: '<html><body>test</body></html>',
      sourceUrl: 'https://www.zillow.com/listing/12345',
      title: 'Nice Apartment - Zillow',
    };

    const payload = assemblePayload(page);

    expect(payload.html).toBe(page.html);
    expect(payload.sourceUrl).toBe(page.sourceUrl);
    expect(payload.capturedAt).toBe('2026-06-11T10:00:00.000Z');
  });

  it('returns a new object (immutable — does not mutate input)', () => {
    const page: CapturedPage = {
      html: '<html></html>',
      sourceUrl: 'https://example.com',
      title: 'Test',
    };

    const payload = assemblePayload(page);

    // Should be a distinct object
    expect(payload).not.toBe(page);
    // Should not have title field
    expect('title' in payload).toBe(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// postIngest — response → IngestResult mapping
// ---------------------------------------------------------------------------

function makeResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  const responseHeaders = new Headers(headers ?? {});
  return new Response(body !== undefined ? JSON.stringify(body) : null, {
    status,
    headers: responseHeaders,
  });
}

const basePayload: IngestPayload = {
  html: '<html></html>',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-06-11T10:00:00.000Z',
};

describe('postIngest', () => {
  it('returns ok:true on 200 with listingId', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, { listingId: 'abc-123' }));

    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.listingId).toBe('abc-123');
    }
  });

  it('returns ok:true on 200 with no listingId (optional field)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, {}));

    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    expect(result.ok).toBe(true);
  });

  it('maps 401 → auth error', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(401));

    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('auth');
      expect(result.message).toContain('session expired');
    }
  });

  it('maps 413 → too_large error', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(413));

    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('too_large');
    }
  });

  it('maps 400 → invalid error with server message', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(makeResponse(400, { error: 'URL is required' }));

    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid');
      expect(result.message).toBe('URL is required');
    }
  });

  it('maps 400 → invalid error with default message when no body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(400, {}));

    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid');
    }
  });

  it('maps 429 → rate_limited with Retry-After', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(makeResponse(429, null, { 'Retry-After': '60' }));

    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('rate_limited');
      expect(result.retryAfter).toBeDefined();
    }
  });

  it('maps 429 → rate_limited without Retry-After header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(429));

    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('rate_limited');
      expect(result.retryAfter).toBeUndefined();
    }
  });

  it('maps 500 → server error', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(500));

    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('server');
    }
  });

  it('maps 503 → server error', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(503));

    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('server');
    }
  });

  it('maps unexpected 2xx status → ok:true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(201, { listingId: 'xyz' }));

    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    expect(result.ok).toBe(true);
  });

  it('maps network error → network error code', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('network');
    }
  });

  it('sends correct Authorization header and URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, {}));

    await postIngest('https://cribai.app', 'my-jwt-token', basePayload, mockFetch);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cribai.app/api/crm/ingest');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer my-jwt-token',
    );
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('sends correct JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, {}));

    await postIngest('https://cribai.app', 'token', basePayload, mockFetch);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as IngestPayload;
    expect(body.html).toBe(basePayload.html);
    expect(body.sourceUrl).toBe(basePayload.sourceUrl);
    expect(body.capturedAt).toBe(basePayload.capturedAt);
  });

  it('parses deepScanQueued from 201 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(201, { listingId: 'l1', deepScanQueued: true }));
    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deepScanQueued).toBe(true);
    }
  });

  it('deepScanQueued is absent when not in response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(201, { listingId: 'l1' }));
    const result = await postIngest('https://cribai.app', 'token', basePayload, mockFetch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deepScanQueued).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// fitPayloadToBudget
// ---------------------------------------------------------------------------

describe('fitPayloadToBudget', () => {
  const base = { html: 'h'.repeat(100), sourceUrl: 'https://x.test/a', capturedAt: '2026-06-12T00:00:00.000Z' };

  it('returns payload unchanged when under budget', () => {
    const p: IngestPayload = { ...base, innerText: 'text', iframes: [{ src: 'https://x.test/f', html: '<p>hi</p>' }] };
    expect(fitPayloadToBudget(p)).toEqual(p);
  });

  it('drops largest iframes first when over budget', () => {
    // 2MB html + 3MB iframe > 4.4MB budget → must drop the big iframe
    const big = 'a'.repeat(3 * 1024 * 1024);
    const p: IngestPayload = { ...base, html: 'h'.repeat(2 * 1024 * 1024), innerText: 'keep',
      iframes: [{ src: 's', html: big }, { src: 't', html: 'tiny' }] };
    const fitted = fitPayloadToBudget(p);
    expect(fitted.iframes).toEqual([{ src: 't', html: 'tiny' }]);
    expect(fitted.innerText).toBe('keep');
  });

  it('truncates innerText after iframes are gone, never touches html', () => {
    const p: IngestPayload = { ...base, html: 'h'.repeat(4 * 1024 * 1024), innerText: 'x'.repeat(1024 * 1024), iframes: [] };
    const fitted = fitPayloadToBudget(p);
    expect(fitted.html).toBe(p.html);
    expect((fitted.innerText ?? '').length).toBeLessThan(p.innerText!.length);
  });

  it('returns a new object when trimming (immutable — does not mutate input)', () => {
    // Provide an over-budget payload so trimming kicks in and a new object must be returned
    const p: IngestPayload = { ...base, html: 'h'.repeat(4 * 1024 * 1024), innerText: 'x'.repeat(1024 * 1024), iframes: [] };
    const fitted = fitPayloadToBudget(p);
    // Original must not be modified
    expect(p.innerText!.length).toBe(1024 * 1024);
    // Fitted must differ
    expect(fitted).not.toBe(p);
  });
});
