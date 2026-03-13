-- Add raw_title as a generated column extracted from raw_data JSONB.
--
-- The embedding pipeline previously selected the full raw_data blob (which can
-- be large) just to read the title field. A generated column avoids pulling the
-- entire blob on every embedding run, reducing payload size and memory usage.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS raw_title text GENERATED ALWAYS AS (raw_data->>'title') STORED;
