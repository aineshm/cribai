-- Add description column (submit-listing route writes it but column didn't exist)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS description text;

-- Add campus_id to ai_query_logs (cribai route writes it but column didn't exist)
ALTER TABLE ai_query_logs ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES campus_configs(id);
