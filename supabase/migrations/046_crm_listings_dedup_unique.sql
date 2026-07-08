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
-- STATUS-AWARE PREDICATE (review fix, CRITICAL — landed same wave, before
-- this migration ever shipped to prod): 037's index comment says "Non-unique
-- (a user may re-save after archiving)" — archiving is a soft-delete, and
-- re-saving the same URL afterward is an intentional, supported flow. The
-- app's dedup SELECT (`selectExistingListing` in packages/ai/src/crm/
-- add-listing.ts) already honors that contract via `.neq('status',
-- 'archived')`. The first draft of this migration's unique index used a
-- bare `WHERE source_url IS NOT NULL` predicate with no status clause,
-- which would have let an archived row permanently occupy the (user_id,
-- source_url) slot: re-saving after archiving would 23505 at INSERT, and
-- since the recovery SELECT also excludes archived rows, it would find
-- nothing and fall through to a generic, permanent db_error — silently
-- breaking archive→re-save. Adding `AND status <> 'archived'` to the index
-- predicate keeps it in lockstep with the app's dedup query: an archived row
-- no longer occupies the slot, so re-saving after archiving is a plain new
-- insert again, while two co-existing non-archived rows for the same
-- (user_id, source_url) still collide exactly as intended.
--
-- Un-archiving (re-activating an archived row) is NOT in scope for this
-- migration/wave. If a future un-archive path re-activates a row while an
-- active duplicate already exists for the same (user_id, source_url), the
-- UPDATE that flips status back would itself 23505 against this index —
-- which is the correct, intended behavior (the invariant this index
-- enforces applies uniformly, not just at INSERT time), and is called out
-- here for whoever builds that path next.
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
-- landed since and must be investigated before re-running. The duplicate
-- check below is grouped by the SAME shape the index predicate now enforces
-- (archived rows excluded), so it only raises on duplicates the corrected
-- index would actually reject — two archived rows (or an archived + a
-- non-archived row) sharing a URL are not duplicates under this contract.
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
    WHERE source_url IS NOT NULL AND status <> 'archived'
    GROUP BY user_id, source_url
    HAVING count(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'crm_listings has % duplicate (user_id, source_url) pairs among non-archived rows — expected zero before adding the AIN-98 dedup unique index. Investigate and resolve duplicates (verified duplicate-free 2026-07-07; a duplicate found here means new dupes landed since) before re-running.', dup_count;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_crm_listings_user_source_url;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_listings_user_source_url_unique
  ON public.crm_listings (user_id, source_url)
  WHERE source_url IS NOT NULL AND status <> 'archived';
