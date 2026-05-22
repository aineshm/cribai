-- Migration 038: AI request latency metrics (AIN-19 / GH #66)
--
-- Per-request lifecycle telemetry for the CribAI chat runtime. Captures
-- request-received → first-model-token (TTFT) → first-tool-result →
-- final-assistant-message → request-completed timestamps plus tool step
-- count and ordered tools_called list.
--
-- Purpose: establish a 24-48h baseline on the deterministic runtime BEFORE
-- AIN-8 cuts over to the LLM-first turn handler. Without this baseline the
-- LLM-first rollout has no rollback signal beyond user complaints. The
-- `runtime` column lets AIN-8 reuse the same recorder with
-- `runtime = 'llm_first'` so both code paths share a single metrics table.
--
-- Telemetry-only — service role writes, service role reads. No client
-- access. Pattern mirrors `agent_runs` (migration 027) with the explicit
-- service_role policy added by migration 035.
--
-- NOTE: Not applied to any Supabase project by this commit. Application is
-- handled separately via Supabase MCP under user supervision once the PR
-- is reviewed.

CREATE TABLE ai_request_metrics (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Per-request correlator propagated through the route. Plain text (not
  -- uuid) so callers may reuse an inbound `x-request-id` header verbatim.
  request_id                   text NOT NULL,

  -- Nullable for anon / guest turns. ON DELETE SET NULL preserves the
  -- baseline row even if the user is deleted later.
  user_id                      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  conversation_id              uuid,

  -- Which runtime serviced the request. AIN-8 flips this to 'llm_first'
  -- when the LLM-first turn handler ships. Constrained to known values so
  -- typos don't fragment the baseline dataset.
  runtime                      text NOT NULL DEFAULT 'deterministic'
    CHECK (runtime IN ('deterministic', 'llm_first')),

  -- Lifecycle timestamps. Only the bookends (`request_received_at` and
  -- `request_completed_at`) are NOT NULL — every other marker is nullable
  -- because some turns legitimately have no tools, no model tokens
  -- (deterministic short-circuits), or fail before completion.
  request_received_at          timestamptz NOT NULL,
  first_model_token_at         timestamptz,
  first_tool_result_at         timestamptz,
  final_assistant_message_at   timestamptz,
  request_completed_at         timestamptz NOT NULL,

  tool_step_count              integer NOT NULL DEFAULT 0
    CHECK (tool_step_count >= 0),

  -- Ordered list of tool names invoked during the turn. Useful for spotting
  -- tool selection drift between deterministic and llm_first runtimes.
  tools_called                 text[] NOT NULL DEFAULT '{}',

  -- Nullable categorical error label (e.g. 'rate_limit', 'gemini_quota',
  -- 'stream_error'). Free-text bodies/stack traces stay in console logs.
  error_kind                   text,

  created_at                   timestamptz NOT NULL DEFAULT now()
);

-- Primary baseline query: "p50/p95 TTFT for the deterministic runtime over
-- the last 48h". Composite index on (runtime, request_received_at DESC).
CREATE INDEX idx_ai_request_metrics_runtime_received
  ON ai_request_metrics (runtime, request_received_at DESC);

-- Per-user lookup ("show me the last 50 turns for user X"). Partial so
-- anon/guest rows (user_id NULL) are excluded from the index.
CREATE INDEX idx_ai_request_metrics_user_received
  ON ai_request_metrics (user_id, request_received_at DESC)
  WHERE user_id IS NOT NULL;

-- Correlator lookup ("trace this request_id end-to-end"). request_id is
-- not unique because retries or downstream re-emissions might reuse it.
CREATE INDEX idx_ai_request_metrics_request_id
  ON ai_request_metrics (request_id);

-- RLS — service-role-only, mirroring agent_runs (migrations 027 + 035).
-- This is operator telemetry, not user-facing data. End users have no
-- legitimate need to read or write metrics rows; the service role bypasses
-- RLS by design for writes, and analytical reads use the same role.
ALTER TABLE ai_request_metrics ENABLE ROW LEVEL SECURITY;

-- Explicit service_role policy (matches the pattern migration 035 backfilled
-- onto agent_runs / api_cache). Default-deny for every other role.
CREATE POLICY "service_role_ai_request_metrics" ON ai_request_metrics
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
