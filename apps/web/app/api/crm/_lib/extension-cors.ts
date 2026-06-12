/**
 * Shared CORS helpers for routes the Chrome extension calls cross-origin
 * (`POST /api/crm/ingest`, `POST /api/auth/validate-email`).
 *
 * The extension has no host_permissions, so its fetches are subject to CORS.
 * Exactly one trusted origin is allowed, configured via the
 * CRM_EXTENSION_ORIGIN env var. Unset = deny all origins (safe default until
 * the Web Store assigns a real extension ID).
 *
 * Example value: `chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef`
 *
 * CORS is not an auth boundary here — the routes enforce their own auth /
 * validation; these headers only let the browser deliver the response to the
 * extension.
 */
export function getConfiguredExtensionOrigin(): string | null {
  const raw = process.env['CRM_EXTENSION_ORIGIN'];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

export function buildExtensionCorsHeaders(requestOrigin: string | null): Headers {
  const allowedOrigin = getConfiguredExtensionOrigin();
  const headers = new Headers();
  if (allowedOrigin && requestOrigin === allowedOrigin) {
    headers.set('access-control-allow-origin', allowedOrigin);
    headers.set('access-control-allow-methods', 'POST, OPTIONS');
    headers.set('access-control-allow-headers', 'content-type, authorization');
    headers.set('access-control-max-age', '86400');
  }
  // Vary so caches don't serve the wrong ACAO to a different origin.
  headers.set('vary', 'Origin');
  return headers;
}
