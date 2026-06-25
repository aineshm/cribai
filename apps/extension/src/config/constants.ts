/**
 * Build-time configuration constants for the CribAI extension.
 *
 * Values are injected at build time via Vite's `define` — set them in your
 * .env file at the extension root (apps/extension/.env):
 *
 *   VITE_CRIBAI_APP_DOMAIN=https://cribai.app
 *   VITE_CRIBAI_WEB_APP_URL=https://ai-real-estate-agent-omega.vercel.app
 *   VITE_CRIBAI_API_BASE=http://localhost:3000  (dev only — does NOT affect deep-links)
 *   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<publishable anon key — safe to embed>
 *
 * The service-role key (SUPABASE_SECRET_KEY) MUST NEVER appear here.
 */

/** Base URL of the CribAI web app. Used for deep-links after successful save. */
export const APP_DOMAIN: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof __CRIBAI_APP_DOMAIN__ !== 'undefined' ? __CRIBAI_APP_DOMAIN__ : '') as string;

/**
 * User-facing web URL for deep-links (e.g. "Open My Apartments").
 *
 * This is INDEPENDENT of API_BASE: in dev builds API_BASE is typically
 * http://localhost:3000 (the local Next.js server), but deep-links must
 * always open the live public site. Sourced from VITE_CRIBAI_WEB_APP_URL;
 * falls back to the known prod Vercel deployment so that even a plain
 * `pnpm build` (without .env overrides) emits a working https:// URL.
 *
 * Never fall back to APP_DOMAIN here — APP_DOMAIN may be localhost in dev.
 */
export const WEB_APP_URL: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof __CRIBAI_WEB_APP_URL__ !== 'undefined'
    ? __CRIBAI_WEB_APP_URL__
    : 'https://ai-real-estate-agent-omega.vercel.app') as string;

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

/**
 * Maximum characters of stripped body content included in the structured
 * capture output (AIN-76). The body is stripped of script/style/svg blocks
 * before this cap is applied. A stripped Zillow /apartments/ page is ~640KB
 * after tag removal; this cap keeps the total structured payload well under
 * MAX_HTML_BYTES while still covering labeled-DOM patterns and the LLM rare
 * path (which calls pruneHtml, capping at 50KB anyway).
 *
 * If you change this value, update BOTH this constant AND the inlined literal
 * in captureAndSendInline in background/index.ts (same constraint as the
 * other inlined constants — see the "keep BOTH in sync" comment there).
 */
export const MAX_BODY_CAPTURE_CHARS = 500_000;

/** Cap on captured page innerText (chars). */
export const MAX_INNER_TEXT_CHARS = 200_000;
/** Max same-origin iframes captured per page. */
export const MAX_IFRAMES = 10;
/** Cap per captured iframe HTML (chars). */
export const MAX_IFRAME_HTML_CHARS = 524_288;
/** Total payload budget (bytes) — stays under the server's 4.5 MiB content-length precheck. */
export const MAX_PAYLOAD_BYTES = Math.floor(4.4 * 1024 * 1024);

/** Ingest endpoint path. */
export const INGEST_PATH = '/api/crm/ingest';

/** Deep-link path after successful save. */
export const MY_APARTMENTS_PATH = '/my-apartments';
