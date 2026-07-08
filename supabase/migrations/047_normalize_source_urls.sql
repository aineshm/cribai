-- Migration 047: normalize crm_listings.source_url + backfill-merge existing
-- duplicates (AIN-98)
--
-- Migration 046 added a unique (user_id, source_url) index (status <>
-- 'archived') but deliberately did NOT normalize the stored strings — its
-- own comment left that "open on AIN-98". Since then, two live duplicate
-- pairs landed on the founder's account (both survive 046's index because
-- the strings differ only by a URL fragment):
--   - 100 Van Ness (apartments.com): keeper row nicknamed "Van Ness Flat"
--     (source_url ".../yv6dh0t/", saved 2026-07-07 23:34:14) vs a duplicate
--     nicknamed "Van Ness One" (source_url ".../yv6dh0t/#cjzhjxg-2-unit",
--     saved 2026-07-07 23:34:21, 7s later).
--   - Parkmerced (apartments.com): keeper row nicknamed "Parkmerced Classic"
--     (source_url ".../26ht3d9/", saved 2026-07-08 02:48) vs a duplicate
--     nicknamed "19th Ave Parkmerced" (source_url
--     ".../26ht3d9/#pbczdcv-1-floorPlan", saved 2026-07-08 02:51).
-- In both pairs the EARLIER-saved row is the correct keeper (first-write-
-- wins is the simplest, safest merge policy here — it's also the row a
-- founder is more likely to have already interacted with/annotated).
--
-- This migration is written GENERICALLY (grouped by computed identity, not
-- hardcoded row ids) so it resolves whichever duplicate pairs actually exist
-- in prod at apply time — the two pairs above are the ones VERIFIED to exist
-- as of 2026-07-08 and are documented here for the founder's review, not
-- because the migration depends on their specific ids.
--
-- Normalization scope (matches packages/ai/src/crm/source-url.ts's
-- normalizeSourceUrl for the fields that matter to EXISTING stored rows):
--   - Strip the URL fragment (`#...`).
--   - Strip a single trailing slash from a non-root path.
--   - Tracking-param stripping (utm_*, gclid, etc.) and query-param sorting
--     are NOT applied here — zero param-only duplicate variants were
--     observed in prod as of 2026-07-08 (both live pairs differ ONLY by
--     fragment). New saves normalize params at write time via
--     normalizeSourceUrl; this migration only needs to collapse what
--     ALREADY exists.
--
-- Three steps, one transaction:
--   1. Compute each row's normalized source_url into a temp table.
--   2. For every (user_id, normalized_url) collision group among
--      non-archived rows: keep the EARLIEST `saved_at` row, copy
--      nickname/user_notes/analysis/analyzed_at/raw_extraction from the
--      duplicate onto the keeper ONLY where the keeper's own value is
--      null/empty, then delete the duplicate (cascades its
--      crm_listing_captures row via FK).
--   3. UPDATE every surviving row's source_url to its normalized value (now
--      collision-free by construction), then re-run a 046-style duplicate
--      guard as a final assert.
--
-- Guard: RAISE EXCEPTION if any non-archived collision group has more than
-- 2 members (the two known live pairs are both exactly 2; a 3+ group means
-- something the founder hasn't seen/adjudicated yet — fail loud rather than
-- silently pick a keeper among 3+ candidates). Archived rows are
-- deliberately EXCLUDED from grouping/merging — 046's unique index already
-- exempts them (`status <> 'archived'`), so an archived row normalizing to
-- the same identity as an active row is not a violation and needs no
-- special handling; it is still normalized in Step 3 like every other row.
--
-- NOTE: file-only in this commit — NOT applied in this session. Applied via
-- Supabase MCP under founder supervision at the merge gate (043-046
-- precedent), immediately after re-verifying which duplicate pairs exist in
-- prod at that time (this migration's guard will re-verify no group exceeds
-- 2 members regardless).

BEGIN;

-- ---------------------------------------------------------------------------
-- STEP 1: compute the normalized source_url for every row.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE ain98_normalized ON COMMIT DROP AS
SELECT
  id,
  user_id,
  status,
  saved_at,
  source_url AS raw_source_url,
  CASE
    -- Root path (scheme://host/ with nothing else) keeps its trailing slash —
    -- only strip a trailing slash from a NON-root path.
    WHEN split_part(source_url, '#', 1) ~ '^https?://[^/]+/$'
      THEN split_part(source_url, '#', 1)
    ELSE regexp_replace(split_part(source_url, '#', 1), '/$', '')
  END AS normalized_url
FROM public.crm_listings
WHERE source_url IS NOT NULL;

-- ---------------------------------------------------------------------------
-- STEP 2: guard — no non-archived collision group may exceed 2 members.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  oversized_count integer;
BEGIN
  SELECT count(*) INTO oversized_count FROM (
    SELECT user_id, normalized_url
    FROM ain98_normalized
    WHERE status <> 'archived'
    GROUP BY user_id, normalized_url
    HAVING count(*) > 2
  ) oversized;

  IF oversized_count > 0 THEN
    RAISE EXCEPTION 'AIN-98 source_url normalization: % (user_id, normalized_url) group(s) among non-archived rows have MORE THAN 2 members — expected at most the 2 known live pairs (100 Van Ness, Parkmerced) as of 2026-07-08. A 3+ group means new duplicates landed that this migration has not been reviewed against. Investigate before re-running.', oversized_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 3: merge each 2-member collision group onto its earliest-saved row,
-- then delete the duplicate.
-- ---------------------------------------------------------------------------
WITH collisions AS (
  SELECT user_id, normalized_url
  FROM ain98_normalized
  WHERE status <> 'archived'
  GROUP BY user_id, normalized_url
  HAVING count(*) = 2
),
ranked AS (
  SELECT
    n.id,
    n.user_id,
    n.normalized_url,
    row_number() OVER (
      PARTITION BY n.user_id, n.normalized_url
      ORDER BY n.saved_at ASC, n.id ASC
    ) AS rn
  FROM ain98_normalized n
  JOIN collisions c
    ON c.user_id = n.user_id AND c.normalized_url = n.normalized_url
  WHERE n.status <> 'archived'
),
keepers AS (
  SELECT id, user_id, normalized_url FROM ranked WHERE rn = 1
),
losers AS (
  SELECT id, user_id, normalized_url FROM ranked WHERE rn = 2
)
-- Fill-gap merge: copy the loser's field onto the keeper ONLY where the
-- keeper's own value is null/empty — never overwrites a keeper's real data.
UPDATE public.crm_listings AS keeper_row
SET
  nickname = COALESCE(keeper_row.nickname, loser_row.nickname),
  user_notes = COALESCE(keeper_row.user_notes, loser_row.user_notes),
  analysis = COALESCE(keeper_row.analysis, loser_row.analysis),
  analyzed_at = COALESCE(keeper_row.analyzed_at, loser_row.analyzed_at),
  raw_extraction = COALESCE(keeper_row.raw_extraction, loser_row.raw_extraction)
FROM keepers k
JOIN losers l ON l.user_id = k.user_id AND l.normalized_url = k.normalized_url
JOIN public.crm_listings loser_row ON loser_row.id = l.id
WHERE keeper_row.id = k.id;

-- Delete the losing duplicate rows (cascades crm_listing_captures via FK).
DELETE FROM public.crm_listings
WHERE id IN (
  SELECT n.id
  FROM ain98_normalized n
  JOIN collisions c ON c.user_id = n.user_id AND c.normalized_url = n.normalized_url
  WHERE n.status <> 'archived'
    AND n.id NOT IN (
      SELECT id FROM (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY user_id, normalized_url
            ORDER BY saved_at ASC, id ASC
          ) AS rn
        FROM ain98_normalized
        WHERE status <> 'archived'
      ) ranked_for_delete
      WHERE rn = 1
    )
);

-- ---------------------------------------------------------------------------
-- STEP 4: normalize every surviving row's source_url (collision-free by
-- construction after Step 3's merge/delete).
-- ---------------------------------------------------------------------------
UPDATE public.crm_listings AS row_to_update
SET source_url = n.normalized_url
FROM ain98_normalized n
WHERE row_to_update.id = n.id
  AND row_to_update.source_url IS DISTINCT FROM n.normalized_url;

-- ---------------------------------------------------------------------------
-- STEP 5: final assert — zero (user_id, source_url) duplicates remain among
-- non-archived rows (same shape as 046's own guard).
-- ---------------------------------------------------------------------------
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
    RAISE EXCEPTION 'AIN-98 source_url normalization: % duplicate (user_id, source_url) pair(s) remain among non-archived rows AFTER the merge — expected zero. Investigate before committing this migration.', dup_count;
  END IF;
END $$;

COMMIT;
