import { z } from 'zod';

// ─── Enum schemas ──────────────────────────────────────────

export const missionStatusSchema = z.enum([
  'pending',
  'running',
  'active',
  'paused',
  'waiting_approval',
  'scheduled',
  'completed',
  'failed',
  'expired',
]);

export type MissionStatus = z.infer<typeof missionStatusSchema>;

export const missionTypeSchema = z.enum([
  'tour_booking',
  'lease_review',
  'landlord_outreach',
  'price_negotiation',
  'listing_comparison',
  'housing_search',
  'tour_outreach',
]);

export type MissionType = z.infer<typeof missionTypeSchema>;

export const executionLogStatusSchema = z.enum([
  'success',
  'pending',
  'error',
  'running',
]);

export type ExecutionLogStatus = z.infer<typeof executionLogStatusSchema>;

export const draftTypeSchema = z.enum([
  'tour_schedule',
  'email_draft',
  'negotiation_offer',
  'search_report',
]);

export type DraftType = z.infer<typeof draftTypeSchema>;

export const userDecisionSchema = z.enum([
  'approved',
  'edited',
  'rejected',
]);

export type UserDecision = z.infer<typeof userDecisionSchema>;

// ─── Table schemas (snake_case matching DB columns) ──────────────────────────

export const missionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  type: missionTypeSchema,
  title: z.string(),
  status: missionStatusSchema,
  goal: z.string(),
  listing_id: z.string().uuid().nullable(),
  idempotency_key: z.string().nullable(),
  input: z.record(z.unknown()),
  state: z.record(z.unknown()),
  result: z.record(z.unknown()).nullable(),
  current_step_index: z.number().int(),
  campus_id: z.string().uuid().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

export type Mission = z.infer<typeof missionSchema>;

export const missionLogSchema = z.object({
  id: z.string().uuid(),
  mission_id: z.string().uuid(),
  action: z.string(),
  detail: z.string(),
  status: executionLogStatusSchema,
  tool_name: z.string().nullable(),
  tool_input: z.record(z.unknown()).nullable(),
  tool_output: z.record(z.unknown()).nullable(),
  created_at: z.string(),
}).strict();

export type MissionLog = z.infer<typeof missionLogSchema>;

export const missionDraftSchema = z.object({
  id: z.string().uuid(),
  mission_id: z.string().uuid(),
  draft_type: draftTypeSchema,
  payload: z.record(z.unknown()),
  draft_version: z.number().int(),
  is_current: z.boolean(),
  user_decision: userDecisionSchema.nullable(),
  decided_at: z.string().nullable(),
  created_at: z.string(),
}).strict();

export type MissionDraft = z.infer<typeof missionDraftSchema>;

export const missionSteeringSchema = z.object({
  id: z.string().uuid(),
  mission_id: z.string().uuid(),
  raw_input: z.string(),
  parsed_intent: z.record(z.unknown()).nullable(),
  applied_at: z.string().nullable(),
  created_at: z.string(),
}).strict();

export type MissionSteering = z.infer<typeof missionSteeringSchema>;
