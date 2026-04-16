-- Migration 033: Durable mission queue runtime
--
-- Aligns mission state with the runtime rebuild spec by:
-- - adding queue / lease metadata
-- - extending type + status constraints
-- - adding an atomic claim helper for worker pickup

ALTER TABLE missions
  ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN leased_until TIMESTAMPTZ,
  ADD COLUMN last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN last_error TEXT,
  ADD COLUMN step_attempts JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_type_check;
ALTER TABLE missions ADD CONSTRAINT missions_type_check CHECK (type IN (
  'tour_booking', 'lease_review', 'landlord_outreach',
  'price_negotiation', 'listing_comparison',
  'housing_search', 'tour_outreach',
  'listing_deep_dive', 'sublease_post'
));

ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_status_check;
ALTER TABLE missions ADD CONSTRAINT missions_status_check CHECK (status IN (
  'queued', 'pending', 'running', 'retrying',
  'active', 'paused', 'waiting_approval', 'scheduled',
  'completed', 'failed', 'cancelled', 'expired'
));

DROP INDEX IF EXISTS idx_missions_expires;
CREATE INDEX idx_missions_expires ON missions(expires_at)
  WHERE status IN ('active', 'paused', 'pending', 'running', 'queued', 'retrying');

CREATE INDEX IF NOT EXISTS idx_missions_queue_claim
  ON missions(status, leased_until, updated_at)
  WHERE status IN ('queued', 'retrying', 'pending', 'running');

CREATE OR REPLACE FUNCTION claim_next_mission_job(
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS SETOF missions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  claimed missions%ROWTYPE;
BEGIN
  WITH candidate AS (
    SELECT id
    FROM missions
    WHERE (
      status IN ('queued', 'retrying', 'pending')
      OR (status = 'running' AND leased_until IS NOT NULL AND leased_until < now())
    )
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY
      CASE status
        WHEN 'retrying' THEN 0
        WHEN 'queued' THEN 1
        WHEN 'pending' THEN 2
        ELSE 3
      END,
      updated_at ASC,
      created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE missions AS m
  SET status = 'running',
      attempt_count = COALESCE(m.attempt_count, 0) + 1,
      leased_until = now() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
      last_heartbeat_at = now(),
      last_error = NULL,
      updated_at = now()
  FROM candidate
  WHERE m.id = candidate.id
  RETURNING m.* INTO claimed;

  IF claimed.id IS NULL THEN
    RETURN;
  END IF;

  RETURN NEXT claimed;
END;
$$;

