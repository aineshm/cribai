-- Migration 039: Persisted first-save analysis on crm_listings (AIN-61)
--
-- GET /api/crm/listings/[id]/analysis runs the firstSaveAnalysis core on first
-- request and write-throughs the result here so subsequent dashboard opens are
-- a single indexed read instead of a fresh LLM + Places fanout.
--
--   - analysis:    the full FirstSaveAnalysis struct (FanoutBranch discriminants
--                  preserved per branch — ok | skipped | error). Written only
--                  when no branch errored, so a transient LLM/Places failure is
--                  never frozen as the permanent cached analysis.
--   - analyzed_at: when the persisted analysis was computed.
--
-- RLS: covered by the existing crm_listings policies (user_id = auth.uid());
-- the columns ride along on the row, no new policies needed.
--
-- NOTE: Not applied to any Supabase project by this commit. Application is
-- handled separately via Supabase MCP under user supervision.

ALTER TABLE crm_listings
  ADD COLUMN analysis    jsonb,
  ADD COLUMN analyzed_at timestamptz;
