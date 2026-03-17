-- Add generated columns for latitude/longitude extracted from PostGIS location column.
-- This allows PostgREST (Supabase JS client) to select and filter by lat/lng directly
-- without requiring raw SQL or RPC calls in application code.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS latitude numeric GENERATED ALWAYS AS (ST_Y(location::geometry)) STORED,
  ADD COLUMN IF NOT EXISTS longitude numeric GENERATED ALWAYS AS (ST_X(location::geometry)) STORED;
