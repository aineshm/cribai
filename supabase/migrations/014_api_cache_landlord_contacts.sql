-- Migration 014: API cache table + landlord contact columns + listings landlord FK
-- Purpose: Foundation for Phase 17 real tool integrations (caching external API responses)

-- 1. API cache table (service-role only, no user-facing policies)
CREATE TABLE IF NOT EXISTS api_cache (
  key text PRIMARY KEY,
  response jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_cache_expires ON api_cache (expires_at);

ALTER TABLE api_cache ENABLE ROW LEVEL SECURITY;

-- 2. Landlord contact columns
ALTER TABLE landlords ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE landlords ADD COLUMN IF NOT EXISTS email text;

-- 3. Listings -> Landlords FK
ALTER TABLE listings ADD COLUMN IF NOT EXISTS landlord_id uuid REFERENCES landlords(id);

CREATE INDEX idx_listings_landlord ON listings (landlord_id) WHERE landlord_id IS NOT NULL;
