-- Migration 013: Missions schema for AI Concierge
-- Phase 16: Missions DB Schema
--
-- Creates 4 tables (missions, mission_logs, mission_drafts, mission_steerings)
-- with RLS, Realtime publications, pg_cron cleanup jobs, and HITL draft versioning.

-- Enable pg_cron for scheduled cleanup (first use in this project)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- missions: parent table for all agent missions
-- ============================================================

CREATE TABLE missions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN (
    'tour_booking', 'lease_review', 'landlord_outreach',
    'price_negotiation', 'listing_comparison'
  )),
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'paused', 'waiting_approval', 'scheduled',
    'completed', 'failed', 'expired'
  )),
  goal            TEXT NOT NULL,
  listing_id      UUID REFERENCES listings(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  expires_at      TIMESTAMPTZ DEFAULT now() + interval '24 hours',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own missions" ON missions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_missions_user_status ON missions(user_id, status);
CREATE INDEX idx_missions_expires ON missions(expires_at) WHERE status IN ('active', 'paused');

-- ============================================================
-- mission_logs: append-only execution log entries
-- ============================================================

CREATE TABLE mission_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL CHECK (status IN ('success', 'pending', 'error')),
  tool_name   TEXT,
  tool_input  JSONB,
  tool_output JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mission_logs ENABLE ROW LEVEL SECURITY;

-- SELECT only via join through missions (no direct user_id column)
CREATE POLICY "Users see own mission logs" ON mission_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM missions m
      WHERE m.id = mission_logs.mission_id
      AND m.user_id = auth.uid()
    )
  );

-- No INSERT policy: only service role (executor) can insert logs

CREATE INDEX idx_mission_logs_mission ON mission_logs(mission_id, created_at ASC);

-- ============================================================
-- mission_drafts: HITL approval drafts with versioning
-- ============================================================

CREATE TABLE mission_drafts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id     UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  draft_type     TEXT NOT NULL CHECK (draft_type IN (
    'tour_schedule', 'email_draft', 'negotiation_offer'
  )),
  payload        JSONB NOT NULL,
  draft_version  INTEGER NOT NULL DEFAULT 1,
  is_current     BOOLEAN NOT NULL DEFAULT true,
  user_decision  TEXT CHECK (user_decision IN ('approved', 'edited', 'rejected')),
  decided_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mission_drafts ENABLE ROW LEVEL SECURITY;

-- SELECT via join through missions
CREATE POLICY "Users see own mission drafts" ON mission_drafts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM missions m
      WHERE m.id = mission_drafts.mission_id
      AND m.user_id = auth.uid()
    )
  );

-- UPDATE for user_decision/decided_at only via join
CREATE POLICY "Users decide on own drafts" ON mission_drafts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM missions m
      WHERE m.id = mission_drafts.mission_id
      AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM missions m
      WHERE m.id = mission_drafts.mission_id
      AND m.user_id = auth.uid()
    )
  );

-- No INSERT policy: only service role (executor) can insert drafts

-- ============================================================
-- Trigger: set previous drafts as not current before new insert
-- ============================================================

CREATE OR REPLACE FUNCTION set_draft_not_current()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE mission_drafts
  SET is_current = false
  WHERE mission_id = NEW.mission_id AND is_current = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER before_draft_insert
  BEFORE INSERT ON mission_drafts
  FOR EACH ROW
  EXECUTE FUNCTION set_draft_not_current();

CREATE INDEX idx_mission_drafts_mission_current ON mission_drafts(mission_id) WHERE is_current = true;

-- ============================================================
-- mission_steerings: user mid-mission corrections
-- ============================================================

CREATE TABLE mission_steerings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id    UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  raw_input     TEXT NOT NULL,
  parsed_intent JSONB,
  applied_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mission_steerings ENABLE ROW LEVEL SECURITY;

-- INSERT + SELECT via user_id on parent mission
CREATE POLICY "Users manage own steerings" ON mission_steerings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM missions m
      WHERE m.id = mission_steerings.mission_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users see own steerings" ON mission_steerings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM missions m
      WHERE m.id = mission_steerings.mission_id
      AND m.user_id = auth.uid()
    )
  );

-- No UPDATE/DELETE from client

CREATE INDEX idx_mission_steerings_mission ON mission_steerings(mission_id, created_at ASC);

-- ============================================================
-- Realtime publications (NOT mission_steerings per design)
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE missions;
ALTER PUBLICATION supabase_realtime ADD TABLE mission_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE mission_drafts;

-- ============================================================
-- Trigger: auto-update updated_at on missions
-- ============================================================

CREATE OR REPLACE FUNCTION update_missions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER missions_updated_at
  BEFORE UPDATE ON missions
  FOR EACH ROW
  EXECUTE FUNCTION update_missions_updated_at();

-- ============================================================
-- pg_cron cleanup jobs
-- ============================================================

-- Job 1: Expire stale missions (older than 24h and still active/paused)
SELECT cron.schedule(
  'expire-stale-missions',
  '0 */6 * * *',
  $$
  UPDATE missions
  SET status = 'expired', updated_at = now()
  WHERE status IN ('active', 'paused')
  AND (expires_at IS NOT NULL AND expires_at < now())
  $$
);

-- Job 2: Purge old job_run_details to prevent table bloat
SELECT cron.schedule(
  'purge-cron-job-details',
  '0 4 * * *',
  $$
  DELETE FROM cron.job_run_details
  WHERE end_time < now() - interval '7 days'
  $$
);
