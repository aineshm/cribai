-- Add latitude/longitude as stored generated columns on campus_configs.
-- The table stores location as geography(POINT, 4326) but the app layer
-- (CampusLayout, CampusConfig type) expects flat latitude/longitude numbers.
-- These generated columns are derived automatically from the location column
-- so inserts/updates to location keep them in sync with zero app-layer overhead.

ALTER TABLE campus_configs
  ADD COLUMN IF NOT EXISTS latitude  double precision GENERATED ALWAYS AS (ST_Y(location::geometry)) STORED,
  ADD COLUMN IF NOT EXISTS longitude double precision GENERATED ALWAYS AS (ST_X(location::geometry)) STORED;
