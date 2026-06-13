/**
 * Unit tests for extension-cors.ts helpers (AIN-62 CORS fix).
 *
 * MODULE RE-IMPORT PATTERN (mirrors lib/__tests__/middleware.test.ts):
 * The module reads `process.env['CRM_EXTENSION_ORIGIN']` at call time (not
 * module-load time), so `vi.stubEnv` + `vi.resetModules` + dynamic `import()`
 * gives us a clean read on every env configuration. Each test that needs a
 * different env value calls `vi.resetModules()` before the stub so the module
 * re-evaluates on the subsequent `import()`.
 *
 * HAPPY-DOM / VM-CONTEXT NOTE:
 * `extension-cors.ts` is a pure helper module (no Next.js route machinery,
 * no `next/headers`). It runs in the same vitest worker process context as the
 * test, so `vi.stubEnv` mutations ARE visible to the module — unlike the route
 * modules whose vm isolation prevents process.env propagation. We therefore use
 * `vi.stubEnv` (restoreable) rather than raw `process.env` mutation, with
 * `vi.resetModules()` to force a fresh module evaluation between stubs.
 *
 * CHROME-EXTENSION:// ORIGIN NOTE:
 * happy-dom's Fetch API implementation treats `chrome-extension://` origins as
 * opaque and normalises them to `null`. In real browser traffic the extension
 * DOES send the `origin` header. Because these are pure-function unit tests
 * (not fetch-dispatched route tests), we pass the origin string directly to
 * `buildExtensionCorsHeaders()` — no Fetch API involved — so chrome-extension://
 * values work fine here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ── getConfiguredExtensionOrigin ──────────────────────────────────────────────

describe('getConfiguredExtensionOrigin', () => {
  it('returns null when CRM_EXTENSION_ORIGIN is not set', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', '');
    const { getConfiguredExtensionOrigin } = await import('../extension-cors');
    expect(getConfiguredExtensionOrigin()).toBeNull();
  });

  it('returns null when CRM_EXTENSION_ORIGIN is whitespace-only', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', '   ');
    const { getConfiguredExtensionOrigin } = await import('../extension-cors');
    expect(getConfiguredExtensionOrigin()).toBeNull();
  });

  it('returns the trimmed value when CRM_EXTENSION_ORIGIN has leading/trailing whitespace', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', '  chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef  ');
    const { getConfiguredExtensionOrigin } = await import('../extension-cors');
    expect(getConfiguredExtensionOrigin()).toBe(
      'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef',
    );
  });

  it('returns the value as-is when already trimmed', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', 'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef');
    const { getConfiguredExtensionOrigin } = await import('../extension-cors');
    expect(getConfiguredExtensionOrigin()).toBe(
      'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef',
    );
  });

  it('returns the value for an http:// test origin (used in unit-test workarounds)', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', 'http://localhost:3000');
    const { getConfiguredExtensionOrigin } = await import('../extension-cors');
    expect(getConfiguredExtensionOrigin()).toBe('http://localhost:3000');
  });
});

// ── buildExtensionCorsHeaders — Vary header (always present) ─────────────────

describe('buildExtensionCorsHeaders — Vary header', () => {
  it('always sets Vary: Origin even when env is unset and origin is null', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', '');
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders(null);
    expect(headers.get('vary')).toMatch(/origin/i);
  });

  it('sets Vary: Origin when env is set but origin is null (no match)', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', 'chrome-extension://abc');
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders(null);
    expect(headers.get('vary')).toMatch(/origin/i);
  });

  it('sets Vary: Origin when env is set and origin matches', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', 'chrome-extension://abc');
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders('chrome-extension://abc');
    expect(headers.get('vary')).toMatch(/origin/i);
  });
});

// ── buildExtensionCorsHeaders — no CORS headers when env is unset ─────────────

describe('buildExtensionCorsHeaders — env unset (default deny)', () => {
  it('does not set access-control-allow-origin when env is unset and origin is null', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', '');
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders(null);
    expect(headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not set access-control-allow-origin when env is unset even if origin is provided', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', '');
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders('chrome-extension://someextension');
    expect(headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not set access-control-allow-methods when env is unset', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', '');
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders(null);
    expect(headers.get('access-control-allow-methods')).toBeNull();
  });

  it('does not set access-control-allow-headers when env is unset', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', '');
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders(null);
    expect(headers.get('access-control-allow-headers')).toBeNull();
  });
});

// ── buildExtensionCorsHeaders — matching origin ───────────────────────────────

describe('buildExtensionCorsHeaders — matching origin (all four CORS headers)', () => {
  const EXT_ORIGIN = 'http://localhost:9999'; // http:// workaround for happy-dom

  it('sets access-control-allow-origin to the exact configured origin', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', EXT_ORIGIN);
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders(EXT_ORIGIN);
    expect(headers.get('access-control-allow-origin')).toBe(EXT_ORIGIN);
  });

  it('sets access-control-allow-methods to "GET, POST, OPTIONS"', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', EXT_ORIGIN);
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders(EXT_ORIGIN);
    expect(headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
  });

  it('sets access-control-allow-headers to "content-type, authorization"', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', EXT_ORIGIN);
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders(EXT_ORIGIN);
    expect(headers.get('access-control-allow-headers')).toBe('content-type, authorization');
  });

  it('sets access-control-max-age to "86400"', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', EXT_ORIGIN);
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders(EXT_ORIGIN);
    expect(headers.get('access-control-max-age')).toBe('86400');
  });

  it('handles a real chrome-extension:// origin when passed directly (not via fetch)', async () => {
    const chromeOrigin = 'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef';
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', chromeOrigin);
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    // Pass the origin string directly — no Fetch API involved, no happy-dom stripping.
    const headers = buildExtensionCorsHeaders(chromeOrigin);
    expect(headers.get('access-control-allow-origin')).toBe(chromeOrigin);
    expect(headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
  });
});

// ── buildExtensionCorsHeaders — mismatched origin ────────────────────────────

describe('buildExtensionCorsHeaders — mismatched origin (no CORS headers)', () => {
  it('does not set ACAO when request origin differs from configured origin', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', 'http://localhost:9999');
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders('http://localhost:8888');
    expect(headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not set ACAO for an attacker-supplied wildcard origin (*)', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', 'http://localhost:9999');
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders('*');
    expect(headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not set ACAO for an attacker-supplied null origin string', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', 'http://localhost:9999');
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders('null');
    expect(headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not set access-control-allow-methods on a mismatch', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', 'http://localhost:9999');
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders('http://evil.example.com');
    expect(headers.get('access-control-allow-methods')).toBeNull();
  });

  it('still sets Vary: Origin on a mismatch (cache correctness)', async () => {
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', 'http://localhost:9999');
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders('http://other.example.com');
    expect(headers.get('vary')).toMatch(/origin/i);
  });
});

// ── buildExtensionCorsHeaders — whitespace-trimmed env value ─────────────────

describe('buildExtensionCorsHeaders — whitespace-trimmed env value', () => {
  it('matches the request origin against the trimmed env value (not the raw padded one)', async () => {
    const trimmedOrigin = 'http://localhost:9999';
    vi.resetModules();
    // The env value has surrounding whitespace — the helper must trim before comparing.
    vi.stubEnv('CRM_EXTENSION_ORIGIN', `  ${trimmedOrigin}  `);
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    const headers = buildExtensionCorsHeaders(trimmedOrigin);
    expect(headers.get('access-control-allow-origin')).toBe(trimmedOrigin);
  });

  it('does NOT match when the request origin includes the surrounding whitespace', async () => {
    const trimmedOrigin = 'http://localhost:9999';
    vi.resetModules();
    vi.stubEnv('CRM_EXTENSION_ORIGIN', `  ${trimmedOrigin}  `);
    const { buildExtensionCorsHeaders } = await import('../extension-cors');
    // Request origin with spaces — should NOT match (origin strings don't have spaces).
    const headers = buildExtensionCorsHeaders(`  ${trimmedOrigin}  `);
    expect(headers.get('access-control-allow-origin')).toBeNull();
  });
});
