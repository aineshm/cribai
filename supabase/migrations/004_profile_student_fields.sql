-- Add student context fields to profiles table
-- These fields support profile completion and prepare for v2 roommate matching

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS graduation_year smallint
    CHECK (graduation_year BETWEEN 2020 AND 2035),
  ADD COLUMN IF NOT EXISTS major text,
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;
