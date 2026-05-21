-- Migration 037: Personal CRM schema (PDR-003 Track B Day 1)
--
-- Foundation data layer for the Personal CRM pivot. Adds two per-user tables:
--   - crm_listings: saved listings from EXTERNAL sources (Zillow, Apartments.com,
--     Realtor, Trulia, Facebook Marketplace, Craigslist, etc.) — distinct from
--     in-platform `saved_listings` which references the internal `listings`
--     catalog.
--   - crm_inferred_profiles: implicit user preferences (rent band, target beds,
--     must/nice amenities, home base, commute tolerance, scoring weights) learned
--     from save/decline/tour signals.
--
-- Per-user model with RLS (`user_id = auth.uid()`). PostGIS `geography(POINT,
-- 4326)` column on crm_listings supports downstream proximity queries (sublease
-- discovery, commute scoring).
--
-- NOTE: Not applied to any Supabase project by this commit. Application is
-- handled separately via Supabase MCP under user supervision.

-- ============================================================
-- crm_listings: per-user saved external listings
-- ============================================================

CREATE TABLE crm_listings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url             text,
  source_site            text,
  title                  text,
  address                text,
  coordinates            geography(POINT, 4326)
    CHECK (coordinates IS NULL OR ST_SRID(coordinates::geometry) = 4326),
  rent                   numeric,
  bedrooms               numeric,
  bathrooms              numeric,
  sqft                   numeric,
  available_from         date,
  description            text,
  amenities              jsonb,
  photo_urls             text[],
  raw_extraction         jsonb,
  extraction_confidence  numeric
    CHECK (extraction_confidence IS NULL OR extraction_confidence BETWEEN 0 AND 1),
  status                 text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'declined', 'applied', 'toured')),
  user_notes             text,
  saved_at               timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_crm_listings_user_id
  ON crm_listings(user_id);

CREATE INDEX idx_crm_listings_status
  ON crm_listings(user_id, status)
  WHERE status = 'active';

CREATE INDEX idx_crm_listings_saved_at
  ON crm_listings(user_id, saved_at DESC);

CREATE INDEX idx_crm_listings_coordinates
  ON crm_listings
  USING GIST(coordinates);

-- Dedup / "already saved?" lookup when the user pastes a source URL.
-- Non-unique (a user may re-save after archiving). Partial so rows without a
-- source URL (e.g. manual entries) are skipped.
CREATE INDEX idx_crm_listings_user_source_url
  ON crm_listings(user_id, source_url)
  WHERE source_url IS NOT NULL;

-- RLS
ALTER TABLE crm_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_listings_select_own" ON crm_listings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "crm_listings_insert_own" ON crm_listings
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- WITH CHECK mirrors USING so a user cannot rewrite user_id to another UUID
-- (which would silently transfer the row out of their CRM).
CREATE POLICY "crm_listings_update_own" ON crm_listings
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "crm_listings_delete_own" ON crm_listings
  FOR DELETE USING (user_id = auth.uid());

-- Auto-bump updated_at on UPDATE (mirrors conversations_updated_at /
-- missions_updated_at conventions from migrations 010 and 013).
CREATE OR REPLACE FUNCTION update_crm_listings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_listings_updated_at
  BEFORE UPDATE ON crm_listings
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_listings_updated_at();

-- ============================================================
-- crm_inferred_profiles: implicit preferences per user
-- ============================================================

CREATE TABLE crm_inferred_profiles (
  user_id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rent_min                numeric,
  rent_max                numeric,
  bedrooms_target         numeric,
  must_have_amenities     text[],
  nice_to_have_amenities  text[],
  home_base_address       text,
  commute_max_minutes     integer,
  weights                 jsonb,
  confidence              numeric,
  last_updated_at         timestamptz NOT NULL DEFAULT now()
);

-- RLS — derived state ownership model (mirrors mission_logs / mission_drafts
-- from migration 013):
--   * Clients READ their own row (SELECT policy below).
--   * Clients MAY DELETE their own row so "reset my preferences" UI works
--     without an extra SECURITY DEFINER RPC.
--   * Clients MAY NOT INSERT/UPDATE — inference is derived state owned by the
--     server-side inference worker, which writes via the service role and
--     bypasses RLS. Allowing client writes here would let users hand-edit
--     "inferred" preferences and short-circuit the learning loop.
ALTER TABLE crm_inferred_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_inferred_profiles_select_own" ON crm_inferred_profiles
  FOR SELECT USING (user_id = auth.uid());

-- Reset-my-preferences is a reasonable user-initiated action even though the
-- profile is derived. The inference worker will re-populate on the next
-- save/decline/tour signal.
CREATE POLICY "crm_inferred_profiles_delete_own" ON crm_inferred_profiles
  FOR DELETE USING (user_id = auth.uid());

-- NOTE: no INSERT or UPDATE policy by design. The inference worker writes via
-- the service role (bypasses RLS).

-- Auto-bump last_updated_at on UPDATE (mirrors crm_listings_updated_at).
-- Service-role writers can omit the column; the trigger is cheap insurance
-- against stale timestamps on upsert paths that forget to set it explicitly.
CREATE OR REPLACE FUNCTION update_crm_inferred_profiles_last_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.last_updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_inferred_profiles_last_updated_at
  BEFORE UPDATE ON crm_inferred_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_inferred_profiles_last_updated_at();
