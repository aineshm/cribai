-- Migration 043: Capture storage redesign — gzip objects + retention window (AIN-84)
--
-- Supersedes the AIN-78 design (042): capture HTML moves OUT of Postgres into
-- gzipped objects in a private Supabase Storage bucket ('listing-captures').
-- The crm_listing_captures row becomes a pointer:
--   listing_id / user_id / storage_path / captured_at / consumed_at
--
-- Design decisions (AIN-84, founder-agreed 2026-07-01):
--   - Consumption MARKS consumed_at instead of deleting the row/object. This
--     buys auditability (re-run a fixed extractor against the exact HTML that
--     produced a bad row), an eval corpus, and Postgres memory relief.
--   - A nightly retention sweep (packages/ai/src/cli/cleanup-captures.ts)
--     deletes captures older than CAPTURE_RETENTION_DAYS (default 14) —
--     consumed and unconsumed alike (closes AIN-79). The 042 captured_at
--     index serves the sweep's age predicate.
--   - Bucket is PRIVATE with NO storage.objects policies at all → default
--     deny for anon/authenticated. Only the service-role client (bypasses
--     storage RLS) reads/writes objects. This is deliberate — do NOT copy the
--     public listing-photos (019) policies here.
--   - Existing rows are cleared before the column swap: the table is
--     transient by design and storage_path is NOT NULL with no default.
--     VERIFY THE TABLE IS EMPTY via Supabase MCP immediately before applying.
--   - file-only: not applied to any Supabase project by this commit. Apply
--     via Supabase MCP under user supervision at the merge gate, BEFORE
--     deploying the code that uses it.

-- ============================================================
-- 1. Private storage bucket for gzipped capture HTML
-- ============================================================
-- No storage.objects policies are created on purpose (default-deny;
-- service-role only).
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-captures', 'listing-captures', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. crm_listing_captures: html text column → storage pointer
-- ============================================================
-- Clear transient rows so storage_path can be added NOT NULL without a
-- default. Idempotent: deleting an already-empty table is a no-op.
DELETE FROM public.crm_listing_captures;

ALTER TABLE public.crm_listing_captures
  DROP COLUMN IF EXISTS html;

-- Object path convention: ${user_id}/${listing_id}.html.gz (see
-- packages/supabase/src/storage.ts — capturePath()).
ALTER TABLE public.crm_listing_captures
  ADD COLUMN IF NOT EXISTS storage_path text NOT NULL;

-- NULL = not yet consumed by the crm_deep_extract mission. Re-ingest resets
-- it to NULL (the freshest capture is unconsumed by definition).
ALTER TABLE public.crm_listing_captures
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

-- ============================================================
-- 3. Re-pin grants (migration 034 pattern)
-- ============================================================
-- ALTER TABLE preserves grants, but re-pinning keeps the privilege set
-- explicit and protects against a future DROP/CREATE cycle silently
-- reverting to default privileges.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.crm_listing_captures
  TO authenticated, service_role;
