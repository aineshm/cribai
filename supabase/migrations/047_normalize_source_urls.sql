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
--      null/empty (nickname/user_notes: empty-string counts as "missing" via
--      NULLIF(btrim(...), '') — see the field-level raw_extraction merge
--      helpers below), then delete the duplicate (cascades its
--      crm_listing_captures row via FK).
--   3. UPDATE every surviving row's source_url to its normalized value (now
--      collision-free by construction), then re-run a 046-style duplicate
--      guard as a final assert.
--
-- Review fix (MEDIUM, AIN-98 adjudication): the original merge used a
-- whole-column `raw_extraction = COALESCE(keeper.raw_extraction,
-- loser.raw_extraction)` — an all-or-nothing choice that drops the LOSER's
-- entire raw_extraction (including any floor_plans/units_of_interest it
-- carries) the instant the keeper has ANY raw_extraction at all, even if the
-- keeper's own `deep_extract` is missing a subfield the loser actually has.
-- Both live pairs today are apartments.com saves with no units_of_interest,
-- but a future Zillow-fragment collision must not silently drop the loser's
-- unit signal. `ain98_merge_raw_extraction` (below) instead keeps the
-- keeper's raw_extraction as the base and fills ONLY `deep_extract.
-- floor_plans` / `deep_extract.units_of_interest` from the loser when the
-- keeper's own value is null/absent — mirroring the app-layer never-wipe
-- guards in `add-listing.ts` and `04-update-row.ts`. When BOTH sides carry a
-- units_of_interest array, they're merged (concat + zpid-dedupe + cap 12)
-- rather than one clobbering the other — see `ain98_merge_units_of_interest`.
-- Both helper functions are ONE-OFF for this migration's backfill only —
-- dropped before COMMIT, not left in the schema.
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
--
-- Also adds (STEP 6, end of file) `crm_append_unit_of_interest` — a
-- PERMANENT RPC function (not part of the one-time backfill) that replaces
-- `enrichExistingListingWithUnit`'s read-merge-write in add-listing.ts with
-- a single atomic UPDATE, closing a lost-update race on concurrent
-- units_of_interest appends (Review fix, HIGH, AIN-98 adjudication). Kept in
-- this file rather than a separate migration because it ships in the same
-- PR/merge-gate window as the normalization work it's adjacent to.

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
-- STEP 3a: field-level deep_extract merge helpers (Review fix, MEDIUM,
-- AIN-98 adjudication). One-off for this migration's backfill — DROPped
-- before COMMIT below, never left as permanent schema surface.
-- ---------------------------------------------------------------------------

-- Concat loser-first then keeper (mirrors the TS accumulator's own
-- "existing ++ newly-viewed" append order — see
-- packages/ai/src/crm/add-listing.ts and the crm_append_unit_of_interest
-- function further down this file), zpid-dedupe keeping the LAST occurrence
-- in that concatenation (a zpid present in both arrays resolves to the
-- KEEPER's entry, since keeper is concatenated second), then keep only the
-- most-recent 12 (oldest dropped first) — same cap as
-- SELECTED_UNIT_MAX_COUNT (packages/ai/src/extraction/selected-unit.ts).
CREATE OR REPLACE FUNCTION public.ain98_merge_units_of_interest(
  p_keeper_units jsonb,
  p_loser_units jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
  FROM (
    SELECT elem, ord
    FROM (
      SELECT
        elem,
        ord,
        row_number() OVER (PARTITION BY elem ->> 'zpid' ORDER BY ord DESC) AS rn
      FROM jsonb_array_elements(
        COALESCE(p_loser_units, '[]'::jsonb) || COALESCE(p_keeper_units, '[]'::jsonb)
      ) WITH ORDINALITY AS t(elem, ord)
    ) deduped
    WHERE rn = 1
    ORDER BY ord DESC
    LIMIT 12
  ) capped;
$$;

-- Field-level merge of one row's raw_extraction JSONB onto another's.
-- Keeper's raw_extraction is the base (never wholesale replaced); within
-- `deep_extract`, `floor_plans` and `units_of_interest` fill from the loser
-- ONLY when the keeper's own value is null/absent — every other
-- raw_extraction/deep_extract key on the keeper is untouched.
CREATE OR REPLACE FUNCTION public.ain98_merge_raw_extraction(
  p_keeper_raw jsonb,
  p_loser_raw jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- Neither side has a deep_extract subtree — keeper's raw_extraction
    -- (including NULL) wins outright. Matches the pre-fix whole-column
    -- COALESCE semantics for the common (no deep_extract) case.
    WHEN (p_keeper_raw -> 'deep_extract') IS NULL AND (p_loser_raw -> 'deep_extract') IS NULL
      THEN COALESCE(p_keeper_raw, p_loser_raw)
    ELSE
      jsonb_set(
        COALESCE(p_keeper_raw, p_loser_raw, '{}'::jsonb),
        '{deep_extract}',
        COALESCE(p_keeper_raw -> 'deep_extract', '{}'::jsonb)
          -- Fill-gap: floor_plans only when the keeper's own is null/absent.
          -- `jsonb_typeof(...) IS DISTINCT FROM 'array'` (not a plain `IS
          -- NULL` check) is deliberate: `raw_extraction -> 'deep_extract' ->
          -- 'floor_plans'` is explicitly stored as the JSONB literal `null`
          -- (see 04-update-row.ts's never-wipe fallback, `?? null`), and `->`
          -- returns that jsonb `null` value, NOT a SQL NULL — a plain `IS
          -- NULL` check would miss it and never fill the gap.
          || CASE
               WHEN jsonb_typeof(p_keeper_raw -> 'deep_extract' -> 'floor_plans') IS DISTINCT FROM 'array'
                 AND jsonb_typeof(p_loser_raw -> 'deep_extract' -> 'floor_plans') = 'array'
                 THEN jsonb_build_object(
                   'floor_plans', p_loser_raw -> 'deep_extract' -> 'floor_plans'
                 )
               ELSE '{}'::jsonb
             END
          -- units_of_interest: fill-gap when only one side has it; merge
          -- (concat + zpid-dedupe + cap 12) when BOTH sides carry an array.
          -- Same `jsonb_typeof(...) IS DISTINCT FROM 'array'` rationale as
          -- floor_plans above.
          || CASE
               WHEN jsonb_typeof(p_keeper_raw -> 'deep_extract' -> 'units_of_interest') = 'array'
                 AND jsonb_typeof(p_loser_raw -> 'deep_extract' -> 'units_of_interest') = 'array'
                 THEN jsonb_build_object(
                   'units_of_interest',
                   public.ain98_merge_units_of_interest(
                     p_keeper_raw -> 'deep_extract' -> 'units_of_interest',
                     p_loser_raw -> 'deep_extract' -> 'units_of_interest'
                   )
                 )
               WHEN jsonb_typeof(p_keeper_raw -> 'deep_extract' -> 'units_of_interest') IS DISTINCT FROM 'array'
                 AND jsonb_typeof(p_loser_raw -> 'deep_extract' -> 'units_of_interest') = 'array'
                 THEN jsonb_build_object(
                   'units_of_interest', p_loser_raw -> 'deep_extract' -> 'units_of_interest'
                 )
               ELSE '{}'::jsonb
             END,
        true
      )
  END;
$$;

-- ---------------------------------------------------------------------------
-- STEP 3b: merge each 2-member collision group onto its earliest-saved row,
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
-- nickname/user_notes treat an empty (or all-whitespace) string as "missing"
-- via NULLIF(btrim(...), '') — a keeper row with nickname = '' is not
-- meaningfully "set", and should still receive the loser's real nickname
-- (review fix, AIN-98 adjudication: the original COALESCE only backfilled
-- NULL, silently keeping a blank nickname over the loser's real one).
-- raw_extraction uses the field-level merge helpers above instead of a
-- whole-column COALESCE — see the STEP 3a comment for why.
UPDATE public.crm_listings AS keeper_row
SET
  nickname = COALESCE(
    NULLIF(btrim(keeper_row.nickname), ''),
    NULLIF(btrim(loser_row.nickname), '')
  ),
  user_notes = COALESCE(
    NULLIF(btrim(keeper_row.user_notes), ''),
    NULLIF(btrim(loser_row.user_notes), '')
  ),
  analysis = COALESCE(keeper_row.analysis, loser_row.analysis),
  analyzed_at = COALESCE(keeper_row.analyzed_at, loser_row.analyzed_at),
  raw_extraction = public.ain98_merge_raw_extraction(keeper_row.raw_extraction, loser_row.raw_extraction)
FROM keepers k
JOIN losers l ON l.user_id = k.user_id AND l.normalized_url = k.normalized_url
JOIN public.crm_listings loser_row ON loser_row.id = l.id
WHERE keeper_row.id = k.id;

-- One-off helpers (STEP 3a) — not part of the permanent schema.
DROP FUNCTION public.ain98_merge_raw_extraction(jsonb, jsonb);
DROP FUNCTION public.ain98_merge_units_of_interest(jsonb, jsonb);

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

-- ---------------------------------------------------------------------------
-- STEP 6: crm_append_unit_of_interest — atomic accumulator append (Review
-- fix, HIGH, AIN-98 adjudication). PERMANENT function (unlike the STEP 3a
-- helpers) — this is the ongoing write path `addListing` calls on every
-- already-saved dedup hit, not a one-off backfill step.
--
-- `enrichExistingListingWithUnit` (packages/ai/src/crm/add-listing.ts) used
-- to append a newly-viewed unit onto an EXISTING row's
-- raw_extraction.deep_extract.units_of_interest via a plain read-then-write:
-- a SELECT to fetch the current array, JS-side append/dedupe/cap, then an
-- UPDATE with the whole recomputed raw_extraction object. Two concurrent
-- writers (a second rapid re-save of the same building, or this enrichment
-- racing the crm_deep_extract mission's 04-update-row.ts write) can
-- interleave between the SELECT and the UPDATE — the second writer's UPDATE
-- silently overwrites the first's, losing whichever unit it appended (a
-- classic lost-update / read-modify-write race).
--
-- This function replaces that read-merge-write with a SINGLE UPDATE whose
-- SET expression references the row's OWN `raw_extraction` column directly
-- — never a separate SELECT statement, never a joined alias to the same
-- row. That's the standard Postgres idiom for atomic self-referencing
-- updates (the same guarantee `UPDATE t SET n = n + 1 WHERE id = x` relies
-- on): if two calls race on the same listing, the second call's row lock
-- forces it to re-evaluate its SET expression against the FIRST call's
-- already-committed value (Postgres's EvalPlanQual re-check) — there is no
-- window where one call's UPDATE can read a pre-first-call snapshot of the
-- array and stomp the first call's append.
--
-- SECURITY INVOKER (not DEFINER, deliberately): runs with the CALLING
-- role's privileges, so the `crm_listings_update_own` RLS policy
-- (`user_id = auth.uid()`, migration 037) still gates this UPDATE exactly
-- as if the client had run it directly — this function grants no
-- cross-user access, and needs no explicit user_id parameter/check.
--
-- Guard: no-op (0 rows affected — WHERE clause short-circuits) when p_unit
-- is null or lacks a string 'zpid'. Mirrors `buildSelectedUnitEntry`'s
-- "malformed unit degrades to nothing to append" contract in
-- add-listing.ts — never throws, never partially writes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_append_unit_of_interest(
  p_listing_id uuid,
  p_unit jsonb
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  UPDATE public.crm_listings
  SET raw_extraction = jsonb_set(
    COALESCE(raw_extraction, '{}'::jsonb),
    '{deep_extract,units_of_interest}',
    -- Dedupe-by-zpid (existing entries minus any matching p_unit's zpid),
    -- append p_unit at the end, then keep only the most-recent 12 (oldest
    -- dropped first) — mirrors appendSelectedUnit's semantics in
    -- add-listing.ts (SELECTED_UNIT_MAX_COUNT, extraction/selected-unit.ts).
    COALESCE(
      (
        SELECT jsonb_agg(elem ORDER BY ord)
        FROM (
          SELECT elem, ord
          FROM jsonb_array_elements(
            (
              SELECT COALESCE(jsonb_agg(e ORDER BY o), '[]'::jsonb)
              FROM jsonb_array_elements(
                COALESCE(raw_extraction #> '{deep_extract,units_of_interest}', '[]'::jsonb)
              ) WITH ORDINALITY AS existing(e, o)
              WHERE e ->> 'zpid' IS DISTINCT FROM (p_unit ->> 'zpid')
            ) || jsonb_build_array(p_unit)
          ) WITH ORDINALITY AS t(elem, ord)
          ORDER BY ord DESC
          LIMIT 12
        ) capped
      ),
      '[]'::jsonb
    ),
    true
  )
  WHERE id = p_listing_id
    AND p_unit IS NOT NULL
    AND jsonb_typeof(p_unit -> 'zpid') = 'string';
$$;

GRANT EXECUTE ON FUNCTION public.crm_append_unit_of_interest(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_append_unit_of_interest(uuid, jsonb) TO service_role;

COMMIT;
