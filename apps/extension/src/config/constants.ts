/**
 * Build-time configuration constants for the CribAI extension.
 *
 * Values are injected at build time via Vite's `define` — set them in your
 * .env file at the extension root (apps/extension/.env):
 *
 *   VITE_CRIBAI_APP_DOMAIN=https://cribai.app
 *   VITE_SUPABASE_URL=https://yzplusypxgvqkrmejcuf.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<publishable anon key — safe to embed>
 *
 * The service-role key (SUPABASE_SECRET_KEY) MUST NEVER appear here.
 */

/** Base URL of the CribAI web app. Used for deep-links after successful save. */
export const APP_DOMAIN: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof __CRIBAI_APP_DOMAIN__ !== 'undefined' ? __CRIBAI_APP_DOMAIN__ : '') as string;

/** Base URL for the CribAI API (may differ from APP_DOMAIN on preview deploys). */
export const API_BASE: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof __CRIBAI_API_BASE__ !== 'undefined' ? __CRIBAI_API_BASE__ : APP_DOMAIN) as string;

/** Supabase project URL. */
export const SUPABASE_URL: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '') as string;

/**
 * Supabase publishable anon key — safe to embed in extension bundles.
 * Row-Level Security enforces all access controls; the anon key alone
 * cannot bypass RLS or read other users' data.
 */
export const SUPABASE_ANON_KEY: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : '') as string;

/** Maximum HTML payload size accepted by the server (4 MiB). */
export const MAX_HTML_BYTES = 4 * 1024 * 1024;

/** Ingest endpoint path. */
export const INGEST_PATH = '/api/crm/ingest';

/** Deep-link path after successful save. */
export const MY_APARTMENTS_PATH = '/my-apartments';
