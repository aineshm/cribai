-- Migration 044: crm_listings.nickname — user-renamable display name (AIN-95)
--
-- Adds a nullable `nickname` column to crm_listings, distinct from the
-- extraction-derived `title`. Rationale:
--   - `title` is whatever the source page's extraction produced (often
--     generic/blank — e.g. just "Unit" — see the AIN-90/AIN-95 incident).
--   - `nickname` is a short, memorable, user-renamable handle generated
--     silently in the background after a NEW save and shown everywhere the
--     title shows today (fallback order: nickname ?? title ?? address ??
--     'Saved listing').
--   - Generation NEVER overwrites a user's rename: the background generator
--     writes only `WHERE nickname IS NULL`, so once a value is set (by
--     generation or by the user) it is never silently replaced. No separate
--     marker column is needed — the SQL-level guard is the whole mechanism.
--
-- RLS: covered by the existing crm_listings policies (user_id = auth.uid());
-- the column rides along on the row, no new policies needed.
--
-- NOTE: file-only in this commit. Applied via Supabase MCP under founder
-- supervision at the merge gate (additive nullable column — no data backfill,
-- no guard needed before applying).

ALTER TABLE public.crm_listings
  ADD COLUMN IF NOT EXISTS nickname text;

-- ============================================================
-- Re-pin grants (034 / 043 pattern)
-- ============================================================
-- ALTER TABLE preserves grants, but re-pinning keeps the privilege set
-- explicit and protects against a future DROP/CREATE cycle silently
-- reverting to default privileges.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.crm_listings
  TO authenticated, service_role;
