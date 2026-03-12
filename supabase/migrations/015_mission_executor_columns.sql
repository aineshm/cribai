-- Migration 015: Extend missions schema for MissionExecutor
-- Phase 26: MissionExecutor Core + API Routes
--
-- Adds executor state columns (input, result, current_step_index, campus_id)
-- and extends CHECK constraints for v2.0 mission types and statuses.

-- ============================================================
-- Add executor columns to missions
-- ============================================================

ALTER TABLE missions
  ADD COLUMN input JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN result JSONB,
  ADD COLUMN current_step_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN campus_id UUID REFERENCES campus_configs(id);

-- ============================================================
-- Extend missions.type CHECK — add v2.0 mission types
-- ============================================================

ALTER TABLE missions DROP CONSTRAINT missions_type_check;
ALTER TABLE missions ADD CONSTRAINT missions_type_check CHECK (type IN (
  'tour_booking', 'lease_review', 'landlord_outreach',
  'price_negotiation', 'listing_comparison',
  'housing_search', 'tour_outreach'
));

-- ============================================================
-- Extend missions.status CHECK — add 'pending' and 'running'
-- ============================================================

ALTER TABLE missions DROP CONSTRAINT missions_status_check;
ALTER TABLE missions ADD CONSTRAINT missions_status_check CHECK (status IN (
  'pending', 'running',
  'active', 'paused', 'waiting_approval', 'scheduled',
  'completed', 'failed', 'expired'
));

-- ============================================================
-- Extend mission_logs.status CHECK — add 'running'
-- ============================================================

ALTER TABLE mission_logs DROP CONSTRAINT mission_logs_status_check;
ALTER TABLE mission_logs ADD CONSTRAINT mission_logs_status_check CHECK (status IN (
  'success', 'pending', 'error', 'running'
));

-- ============================================================
-- Extend mission_drafts.draft_type CHECK — add 'search_report'
-- ============================================================

ALTER TABLE mission_drafts DROP CONSTRAINT mission_drafts_draft_type_check;
ALTER TABLE mission_drafts ADD CONSTRAINT mission_drafts_draft_type_check CHECK (draft_type IN (
  'tour_schedule', 'email_draft', 'negotiation_offer', 'search_report'
));

-- ============================================================
-- Update expiry index to include new statuses
-- ============================================================

DROP INDEX IF EXISTS idx_missions_expires;
CREATE INDEX idx_missions_expires ON missions(expires_at)
  WHERE status IN ('active', 'paused', 'pending', 'running');

-- ============================================================
-- Update pg_cron cleanup job to expire pending/running missions too
-- ============================================================

SELECT cron.unschedule('expire-stale-missions');
SELECT cron.schedule(
  'expire-stale-missions',
  '0 */6 * * *',
  $$
  UPDATE missions
  SET status = 'expired', updated_at = now()
  WHERE status IN ('active', 'paused', 'pending', 'running')
  AND (expires_at IS NOT NULL AND expires_at < now())
  $$
);
