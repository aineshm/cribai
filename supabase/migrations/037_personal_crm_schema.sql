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
  coordinates            geography(POINT, 4326),
  rent                   numeric,
  bedrooms               numeric,
  bathrooms              numeric,
  sqft                   numeric,
  available_from         date,
  description            text,
  amenities              jsonb,
  photo_urls             text[],
  raw_extraction         jsonb,
  extraction_confidence  numeric,
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

-- RLS
ALTER TABLE crm_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_listings_select_own" ON crm_listings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "crm_listings_insert_own" ON crm_listings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "crm_listings_update_own" ON crm_listings
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "crm_listings_delete_own" ON crm_listings
  FOR DELETE USING (user_id = auth.uid());

-- Auto-bump updated_at on UPDATE (mirrors conversations_updated_at /
-- missions_updated_at conventions from migrations 010 and 013).
CREATE OR REPLACE FUNCTION update_crm_listings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- RLS
ALTER TABLE crm_inferred_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_inferred_profiles_select_own" ON crm_inferred_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "crm_inferred_profiles_insert_own" ON crm_inferred_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "crm_inferred_profiles_update_own" ON crm_inferred_profiles
  FOR UPDATE USING (user_id = auth.uid());
