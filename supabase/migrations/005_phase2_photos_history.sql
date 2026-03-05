-- Phase 2: Photos, optional rent, source URL, listing history
-- Migration 005

-- 1. Add photo_urls column to listings
ALTER TABLE listings ADD COLUMN photo_urls text[] DEFAULT '{}';

-- 2. Add source_url column for linking back to original listing
ALTER TABLE listings ADD COLUMN source_url text;

-- 3. Make rent_monthly nullable (partial listings with no rent)
ALTER TABLE listings ALTER COLUMN rent_monthly DROP NOT NULL;

-- 4. Create listing_history table for price archive
CREATE TABLE listing_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id       uuid REFERENCES campus_configs(id) NOT NULL,
  external_id     text NOT NULL,
  source          text NOT NULL,
  address         text NOT NULL,
  rent_monthly    numeric,
  first_seen_at   timestamptz,
  last_seen_at    timestamptz,
  archived_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_listing_history_campus ON listing_history (campus_id, archived_at DESC);
CREATE INDEX idx_listing_history_address ON listing_history (address);

-- RLS: listing_history readable by authenticated users matching campus
ALTER TABLE listing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_history_select" ON listing_history
  FOR SELECT USING (
    campus_id = (SELECT campus_id FROM profiles WHERE id = auth.uid())
  );
