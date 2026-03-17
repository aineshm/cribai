-- Migration: Add listing view tracking support
-- 1. Add creator_id to listings so sublease creators can see stats
-- 2. Add composite index on analytics_events for fast listing_viewed queries

-- Add creator_id column (nullable — only set for sublease listings)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES auth.users(id);

-- Index for fast lookups: "all listings created by this user"
CREATE INDEX IF NOT EXISTS idx_listings_creator_id ON listings(creator_id) WHERE creator_id IS NOT NULL;

-- Composite index for querying listing_viewed events by listing_id
-- metadata->>'listing_id' is stored as text in JSONB
CREATE INDEX IF NOT EXISTS idx_analytics_events_listing_viewed
  ON analytics_events (event, (metadata->>'listing_id'))
  WHERE event = 'listing_viewed';
