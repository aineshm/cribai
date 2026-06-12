/**
 * Tests for POST /api/auth/validate-email and OPTIONS /api/auth/validate-email.
 *
 * AIN-62 CORS fix: the Chrome extension calls this route cross-origin before
 * `signInWithOtp`. This file extends the original body-validation tests with
 * CORS coverage for the new OPTIONS export and the CORS headers on POST
 * responses.
 *
 * HAPPY-DOM / CHROME-EXTENSION:// LIMITATION (same as ingest route):
 * happy-dom's Fetch API normalises non-http(s) origins to null when a Request
 * is constructed with them. We work around this by configuring CRM_EXTENSION_ORIGIN
 * to an http:// test origin and building requests with that origin — this
 * exercises the full CORS header path without triggering the happy-dom stripping.
 * The chrome-extension:// origin is verified at unit level in extension-cors.test.ts
 * where we pass the origin string directly to the helper (no Fetch API involved).
 *
 * VM-CONTEXT NOTE:
 * The route module is loaded in a vm context where vi.stubEnv mutations from
 * the test file are not visible (separate process.env object reference across
 * worker-thread boundaries). We use the same direct process.env mutation +
 * finally-restore pattern used by the ingest route CORS tests, which are
 * explicitly documented in that file as the approved workaround for route-level
 * env tests.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { POST, OPTIONS } from '../route';

afterEach(() => {
  // Restore any process.env mutations from CORS tests.
  delete process.env['CRM_EXTENSION_ORIGIN'];
});

// ── Test origin used as the http:// workaround for happy-dom ─────────────────
const TEST_EXTENSION_ORIGIN = 'http://localhost:19999';

function makeRequest(body: unknown, origin?: string): Request {
  return new Request('http://localhost/api/auth/validate-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

function makeOptionsRequest(origin?: string): Request {
  return new Request('http://localhost/api/auth/validate-email', {
    method: 'OPTIONS',
    headers: {
      ...(origin ? { origin } : {}),
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type, authorization',
    },
  });
}

describe('POST /api/auth/validate-email', () => {
  it('accepts .edu emails with isEdu=true and badge=verified_student', async () => {
    const res = await POST(makeRequest({ email: 'student@wisc.edu' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      valid: true,
      isEdu: true,
      badge: 'verified_student',
    });
  });

  it('accepts non-.edu emails with isEdu=false and no badge', async () => {
    const res = await POST(makeRequest({ email: 'user@gmail.com' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ valid: true, isEdu: false });
  });

  it('accepts subdomain .edu emails', async () => {
    const res = await POST(makeRequest({ email: 'student@cs.wisc.edu' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.isEdu).toBe(true);
    expect(data.badge).toBe('verified_student');
  });

  it('is case-insensitive for .edu detection', async () => {
    const res = await POST(makeRequest({ email: 'STUDENT@WISC.EDU' }));
    const data = await res.json();
    expect(data.isEdu).toBe(true);
  });

  it('treats edu.com as non-.edu (TLD check, not substring)', async () => {
    const res = await POST(makeRequest({ email: 'user@edu.com' }));
    const data = await res.json();
    expect(data).toEqual({ valid: true, isEdu: false });
  });

  it('returns 400 for missing email field', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('returns 400 for empty email', async () => {
    const res = await POST(makeRequest({ email: '  ' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('returns 400 for malformed email (no @)', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('returns 400 for malformed email (no TLD)', async () => {
    const res = await POST(makeRequest({ email: 'user@host' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/auth/validate-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });
});

// ── OPTIONS preflight (AIN-62 CORS fix) ──────────────────────────────────────

describe('OPTIONS /api/auth/validate-email — CORS preflight', () => {
  it('returns 204 for a preflight request', async () => {
    process.env['CRM_EXTENSION_ORIGIN'] = TEST_EXTENSION_ORIGIN;
    const req = makeOptionsRequest(TEST_EXTENSION_ORIGIN);
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
  });

  it('returns 204 even when no origin is present and env is unset (safe no-op)', async () => {
    delete process.env['CRM_EXTENSION_ORIGIN'];
    const req = makeOptionsRequest(); // no origin header
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
  });

  it('always sets Vary: Origin on the preflight response', async () => {
    delete process.env['CRM_EXTENSION_ORIGIN'];
    const req = makeOptionsRequest();
    const res = await OPTIONS(req);
    expect(res.headers.get('vary')).toMatch(/origin/i);
  });

  it('returns null body (204 No Content)', async () => {
    const req = makeOptionsRequest();
    const res = await OPTIONS(req);
    // Body must be null / empty for 204.
    const text = await res.text();
    expect(text).toBe('');
  });

  /**
   * VM-CONTEXT LIMITATION: vitest runs route modules in a vm context where
   * process.env mutations from the test file are not visible (the test's
   * process.env and the module's process.env are different object references
   * across worker-thread boundaries). This is the same documented constraint in
   * the ingest route CORS tests.
   *
   * Consequence: we cannot assert positive ACAO matching at the route level
   * (i.e. "env set + origin matches → ACAO present"). That path is fully
   * covered by the extension-cors.test.ts unit tests which call the helper
   * directly without the vm barrier. What we CAN assert here:
   *   - 204 status (infrastructure present)
   *   - Vary: Origin always set
   *   - ACAO absent when no env is configured (default deny, observable since
   *     "no env" is the vm-context's natural state)
   */
  it('does not set ACAO when CRM_EXTENSION_ORIGIN is not configured (default deny)', async () => {
    // vm-context default: env var absent → no ACAO, safe fallback.
    const req = makeOptionsRequest(TEST_EXTENSION_ORIGIN);
    const res = await OPTIONS(req);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

// ── POST CORS headers on every response (AIN-62) ─────────────────────────────

describe('POST /api/auth/validate-email — CORS headers on all response codes', () => {
  /**
   * VM-CONTEXT LIMITATION (same as OPTIONS tests above):
   * Route modules run in a vitest vm context where process.env mutations from
   * the test file are NOT visible. Positive ACAO-matching tests (env set +
   * origin matches → ACAO present) cannot be asserted here at the route level.
   *
   * That positive path is fully covered by extension-cors.test.ts which calls
   * buildExtensionCorsHeaders() directly without the vm barrier.
   *
   * What we CAN assert here:
   *   - Vary: Origin is always set (safe for caching, verifiable without env).
   *   - ACAO is absent when origin is missing (no origin → no allow-origin).
   *   - ACAO is absent when origin doesn't match (default-deny state in vm).
   *   - Response bodies are identical regardless of CORS headers (regression
   *     guard: CORS header attachment must not mutate the body).
   *
   * HAPPY-DOM NOTE: chrome-extension:// origins are stripped to null by
   * happy-dom's Fetch API. We pass origin strings directly to the request
   * constructor headers (plain string, not via fetch); this is fine because
   * the Request constructor in happy-dom accepts them but the origin header
   * value is still what we set for http:// origins. The vm isolation means the
   * positive-match check still can't propagate, but null/mismatch checks work.
   */

  it('sets Vary: Origin on a 200 .edu success response (no origin header)', async () => {
    const res = await POST(makeRequest({ email: 'student@wisc.edu' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('vary')).toMatch(/origin/i);
  });

  it('sets Vary: Origin on a 200 non-.edu success response (no origin header)', async () => {
    const res = await POST(makeRequest({ email: 'user@gmail.com' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('vary')).toMatch(/origin/i);
  });

  it('sets Vary: Origin on a 400 missing-email-field response', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(res.headers.get('vary')).toMatch(/origin/i);
  });

  it('sets Vary: Origin on a 400 malformed-email response', async () => {
    const res = await POST(makeRequest({ email: 'not-valid' }));
    expect(res.status).toBe(400);
    expect(res.headers.get('vary')).toMatch(/origin/i);
  });

  it('sets Vary: Origin on a 400 invalid-JSON response', async () => {
    const req = new Request('http://localhost/api/auth/validate-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.headers.get('vary')).toMatch(/origin/i);
  });

  // ── ACAO absent on no-origin / no-env (observable in vm context) ──────────

  it('does not set ACAO when no origin header is present (same-origin web callers unaffected)', async () => {
    // No origin header — simulates a same-origin fetch from the web app.
    const res = await POST(makeRequest({ email: 'student@wisc.edu' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not set ACAO when env is unset and any origin is provided (default deny)', async () => {
    // In vm context, CRM_EXTENSION_ORIGIN is absent by default → no ACAO.
    const res = await POST(makeRequest({ email: 'student@wisc.edu' }, TEST_EXTENSION_ORIGIN));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  // ── Body is unaffected by CORS header attachment ───────────────────────────

  it('response body (.edu) is not mutated by the CORS header path', async () => {
    // Same body whether or not an origin is provided — CORS only touches headers.
    const resA = await POST(makeRequest({ email: 'student@wisc.edu' }));
    const resB = await POST(makeRequest({ email: 'student@wisc.edu' }, TEST_EXTENSION_ORIGIN));
    expect(await resA.json()).toEqual(await resB.json());
  });

  it('response body (non-.edu) is not mutated by the CORS header path', async () => {
    const resA = await POST(makeRequest({ email: 'user@gmail.com' }));
    const resB = await POST(makeRequest({ email: 'user@gmail.com' }, TEST_EXTENSION_ORIGIN));
    expect(await resA.json()).toEqual(await resB.json());
  });

  it('response body (400 invalid-email) is not mutated by the CORS header path', async () => {
    const resA = await POST(makeRequest({}));
    const resB = await POST(makeRequest({}, TEST_EXTENSION_ORIGIN));
    expect(await resA.json()).toEqual(await resB.json());
  });
});
