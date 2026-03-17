-- Migration 023: Agent run logging for CribAI tool observability
CREATE TABLE agent_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  campus_id        uuid REFERENCES campus_configs(id) ON DELETE SET NULL,
  conversation_id  uuid,
  tool_name        text NOT NULL,
  phase            smallint,
  args_summary     jsonb NOT NULL DEFAULT '{}',
  result_status    text NOT NULL
                   CHECK (result_status IN ('success', 'error', 'timeout')),
  result_summary   jsonb NOT NULL DEFAULT '{}',
  error_message    text,
  duration_ms      integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_runs_user_id    ON agent_runs (user_id, created_at DESC);
CREATE INDEX idx_agent_runs_tool_name  ON agent_runs (tool_name, created_at DESC);
CREATE INDEX idx_agent_runs_created_at ON agent_runs (created_at DESC);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
-- Service-role only — no permissive policies for end users
