-- Migration 046: crm_listings dedup race — unique constraint (AIN-98)
--
-- The application-level SELECT dedup in addListing (packages/ai/src/crm/
-- add-listing.ts) has a TOCTOU race: two near-simultaneous saves for the
-- same (user_id, source_url) can both pass the SELECT check before either
-- INSERT lands. Observed in prod 2026-07-07: a double-fire (extension
-- button double-click / retry) created a duplicate row ~0.2s apart. The
-- orphan was deleted under founder approval the same day.
--
-- This adds a partial unique index enforcing the invariant at the DB level;
-- addListing's insert-error handler now treats the resulting 23505
-- (unique_violation) as the same "already saved" response the SELECT path
-- returns, so the race is now database-safe instead of merely
-- best-effort-safe.
--
-- Supersedes the non-unique index from 037 (idx_crm_listings_user_source_url)
-- on the same columns/predicate — that index becomes redundant once the
-- unique one exists, so it's dropped here rather than carrying two indexes
-- for one query shape.
--
-- Deliberately NO url normalization in this migration/wave: the founder
-- saves distinct `#unit` fragments as distinct rows today, and normalization
-- policy stays open on AIN-98. A row with a NULL source_url is exempt (the
-- `WHERE source_url IS NOT NULL` partial predicate), matching 037's
-- original index.
--
-- GUARD (043 precedent): raises with a clear message instead of letting
-- CREATE UNIQUE INDEX fail with a generic Postgres error if duplicates
-- exist — prod was manually verified duplicate-free 2026-07-07 immediately
-- before this migration was written; a duplicate found here means new dupes
-- landed since and must be investigated before re-running.
--
-- NOTE: file-only in this commit. Applied via Supabase MCP under founder
-- supervision at the merge gate, immediately after re-verifying prod is
-- still duplicate-free.

DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT user_id, source_url
    FROM public.crm_listings
    WHERE source_url IS NOT NULL
    GROUP BY user_id, source_url
    HAVING count(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'crm_listings has % duplicate (user_id, source_url) pairs — expected zero before adding the AIN-98 dedup unique index. Investigate and resolve duplicates (verified duplicate-free 2026-07-07; a duplicate found here means new dupes landed since) before re-running.', dup_count;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_crm_listings_user_source_url;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_listings_user_source_url_unique
  ON public.crm_listings (user_id, source_url)
  WHERE source_url IS NOT NULL;
