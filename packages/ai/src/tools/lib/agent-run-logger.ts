/**
 * Centralized agent run logging for CribAI tools.
 * Fire-and-forget — logging failures never break tool calls.
 */
import { createClient } from '@supabase/supabase-js';
import type { ToolResult } from '../types';

// PII fields to strip per tool
const PII_FIELDS: Record<string, readonly string[]> = {
  create_sublease: ['contact_email', 'description', 'roommate_info', 'gender_restriction', 'address'],
  schedule_tour: ['student_name', 'student_email', 'notes'],
  contact_pm: ['message'],
  web_search: ['query'],
};

/**
 * Remove PII/free-text fields from tool args.
 * Returns a new object with only structural, non-identifying fields.
 */
export function sanitizeArgs(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const fieldsToStrip = PII_FIELDS[toolName];
  if (!fieldsToStrip) {
    return { ...args };
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (fieldsToStrip.includes(key)) {
      continue;
    }
    sanitized[key] = value;
  }

  // Add count-based summaries for stripped array fields
  if (toolName === 'schedule_tour' && Array.isArray(args.preferred_dates)) {
    sanitized.preferred_dates_count = args.preferred_dates.length;
  }

  return sanitized;
}

/**
 * Extract key metrics from a tool result for the result_summary column.
 */
export function extractResultSummary(
  _toolName: string,
  result: ToolResult,
): Record<string, unknown> {
  const block = result.clientBlock;

  // Listing card results: count the listings
  if (block.type === 'listing_card' && 'listings' in block) {
    return { result_count: (block.listings as unknown[]).length };
  }

  // Tour confirmation: extract tour ID
  if (block.type === 'tour_confirmation' && 'tourRequestId' in block) {
    return { tour_id: block.tourRequestId };
  }

  return {};
}

export interface AgentRunParams {
  readonly userId?: string;
  readonly campusId: string;
  readonly conversationId?: string;
  readonly toolName: string;
  readonly phase?: number;
  readonly argsSummary: Record<string, unknown>;
  readonly resultStatus: 'success' | 'error' | 'timeout';
  readonly resultSummary?: Record<string, unknown>;
  readonly errorMessage?: string;
  readonly durationMs: number;
}

/**
 * Log a tool invocation to the agent_runs table.
 * Fire-and-forget: never awaited by the caller, never throws.
 */
export function logAgentRun(params: AgentRunParams): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  // Silently skip if env vars missing (e.g., in tests without setup)
  if (!supabaseUrl || !secretKey) {
    return;
  }

  const client = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fire-and-forget: intentionally not awaited
  void (async () => {
    try {
      const { error } = await client
        .from('agent_runs')
        .insert({
          user_id: params.userId ?? null,
          campus_id: params.campusId,
          conversation_id: params.conversationId ?? null,
          tool_name: params.toolName,
          phase: params.phase ?? null,
          args_summary: params.argsSummary,
          result_status: params.resultStatus,
          result_summary: params.resultSummary ?? {},
          error_message: params.errorMessage ?? null,
          duration_ms: params.durationMs,
        });
      if (error) {
        console.error('[agent-run-logger] Failed to log:', error.message);
      }
    } catch (err: unknown) {
      console.error('[agent-run-logger] Unexpected error:', err);
    }
  })();
}
