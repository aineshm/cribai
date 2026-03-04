-- CampusNest Initial Schema
-- Multi-campus student housing intelligence platform

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================
-- Campus Configs
-- ============================================================
CREATE TABLE campus_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  name            text NOT NULL,
  university_name text NOT NULL,
  edu_domains     text[] NOT NULL,
  location        geography(POINT, 4326),
  timezone        text NOT NULL DEFAULT 'America/Chicago',
  scrape_cron     text NOT NULL DEFAULT '0 2 * * *',
  scrape_radius_km numeric NOT NULL DEFAULT 5,
  config          jsonb NOT NULL DEFAULT '{}',
  is_public       boolean NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

-- ============================================================
-- User Profiles (extends auth.users)
-- ============================================================
CREATE TABLE profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  campus_id           uuid REFERENCES campus_configs(id),
  display_name        text,
  edu_email           text,
  is_edu_verified     boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  subscription_tier   text NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro', 'premium')),
  stripe_customer_id  text,
  created_at          timestamptz DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Listings (scraped + deduplicated)
-- ============================================================
CREATE TABLE listings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id       uuid REFERENCES campus_configs(id) NOT NULL,
  external_id     text NOT NULL,
  source          text NOT NULL,
  raw_data        jsonb NOT NULL,
  address         text NOT NULL,
  location        geography(POINT, 4326),
  rent_monthly    numeric NOT NULL,
  bedrooms        smallint,
  bathrooms       numeric,
  sqft            numeric,
  amenities       jsonb DEFAULT '[]',
  available_date  date,
  true_cost       jsonb,
  true_cost_total numeric,
  fairness_score  numeric CHECK (fairness_score BETWEEN 1 AND 10),
  fairness_data   jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  first_seen_at   timestamptz DEFAULT now(),
  last_seen_at    timestamptz DEFAULT now(),
  UNIQUE(external_id, source)
);

CREATE INDEX idx_listings_campus_rent ON listings (campus_id, rent_monthly) WHERE is_active;
CREATE INDEX idx_listings_location ON listings USING GIST (location);
CREATE INDEX idx_listings_campus_active ON listings (campus_id) WHERE is_active;

-- ============================================================
-- PageIndex Trees (hierarchical RAG)
-- ============================================================
CREATE TABLE pageindex_trees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id   uuid REFERENCES campus_configs(id),
  entity_type text NOT NULL,
  tree        jsonb NOT NULL,
  leaf_count  integer NOT NULL DEFAULT 0,
  built_at    timestamptz DEFAULT now(),
  UNIQUE(campus_id, entity_type)
);

-- ============================================================
-- AI Query Logs (rate limiting)
-- ============================================================
CREATE TABLE ai_query_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) NOT NULL,
  query_text  text NOT NULL,
  tokens_used integer,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_ai_logs_user_date ON ai_query_logs (user_id, created_at DESC);

-- ============================================================
-- Landlords + Reviews
-- ============================================================
CREATE TABLE landlords (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  company    text,
  scorecard  jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE landlord_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id    uuid REFERENCES landlords(id) NOT NULL,
  user_id        uuid REFERENCES auth.users(id) NOT NULL,
  listing_id     uuid REFERENCES listings(id),
  ratings        jsonb NOT NULL,
  review_text    text,
  lease_verified boolean NOT NULL DEFAULT false,
  lease_doc_path text,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(landlord_id, user_id)
);

-- ============================================================
-- Sublets (Phase 2)
-- ============================================================
CREATE TABLE sublets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) NOT NULL,
  campus_id      uuid REFERENCES campus_configs(id) NOT NULL,
  title          text NOT NULL,
  rent_monthly   numeric NOT NULL,
  available_from date NOT NULL,
  available_to   date,
  photos         text[],
  status         text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'expired', 'removed')),
  created_at     timestamptz DEFAULT now()
);

-- ============================================================
-- Roommate Profiles (Phase 2)
-- ============================================================
CREATE TABLE roommate_profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id),
  campus_id   uuid REFERENCES campus_configs(id) NOT NULL,
  preferences jsonb NOT NULL DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  updated_at  timestamptz DEFAULT now()
);

-- ============================================================
-- Custom JWT Claims for RLS
-- ============================================================
CREATE OR REPLACE FUNCTION auth.custom_claims(uid uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'campus_id', p.campus_id,
      'is_edu_verified', p.is_edu_verified,
      'subscription_tier', p.subscription_tier
    ) FROM profiles p WHERE p.id = uid
  );
END;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE campus_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE landlords ENABLE ROW LEVEL SECURITY;
ALTER TABLE landlord_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE sublets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_query_logs ENABLE ROW LEVEL SECURITY;

-- Public campus configs
CREATE POLICY "public_campus_configs" ON campus_configs
  FOR SELECT USING (is_public = true);

-- Users can read their own profile
CREATE POLICY "own_profile_select" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "own_profile_update" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Campus-scoped listings (all authenticated users can read their campus listings)
CREATE POLICY "campus_listings_select" ON listings
  FOR SELECT USING (
    campus_id = (
      SELECT campus_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Landlords are publicly readable
CREATE POLICY "landlords_select" ON landlords
  FOR SELECT USING (true);

-- Reviews: read all, write only if edu-verified
CREATE POLICY "reviews_select" ON landlord_reviews
  FOR SELECT USING (true);

CREATE POLICY "reviews_insert" ON landlord_reviews
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND (SELECT is_edu_verified FROM profiles WHERE id = auth.uid()) = true
  );

-- Sublets: campus-scoped reads, own writes
CREATE POLICY "sublets_select" ON sublets
  FOR SELECT USING (
    campus_id = (SELECT campus_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "sublets_insert" ON sublets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sublets_update" ON sublets
  FOR UPDATE USING (auth.uid() = user_id);

-- AI logs: own data only
CREATE POLICY "ai_logs_select" ON ai_query_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ai_logs_insert" ON ai_query_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
