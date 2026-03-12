/**
 * mission.ts — Zod schemas and TypeScript types for the mission system.
 *
 * Defines validated enums and table schemas for missions, logs, drafts,
 * and steerings. All types are inferred from Zod so the schema is the
 * single source of truth — TypeScript types stay in sync automatically.
 * Column names use snake_case to match the Supabase/PostgreSQL schema.
 */

import { z } from 'zod';

// ─── Enum schemas ──────────────────────────────────────────

export const missionStatusSchema = z.enum([
  'pending',           // created, not yet picked up by executor
  'running',           // executor is actively processing steps
  'active',            // legacy v1.0 status (manual missions)
  'paused',            // user paused execution
  'waiting_approval',  // executor paused for HITL draft approval
  'scheduled',         // queued to run at a future time
  'completed',         // all steps finished successfully
  'failed',            // step threw or draft was rejected
  'expired',           // passed expires_at without completing
]);

export type MissionStatus = z.infer<typeof missionStatusSchema>;

export const missionTypeSchema = z.enum([
  // v1.0 mission types (legacy)
  'tour_booking',
  'lease_review',
  'landlord_outreach',
  'price_negotiation',
  'listing_comparison',
  // v2.0 executor mission types
  'housing_search',  // Phase 27 — multi-step listing search + shortlist
  'tour_outreach',   // Phase 28 — email draft + send to landlord
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
  'tour_schedule',      // proposed tour time slot awaiting user confirmation
  'email_draft',        // outreach email to landlord awaiting user approval
  'negotiation_offer',  // price counter-offer awaiting user sign-off
  'search_report',      // housing search shortlist awaiting user review (v2.0)
]);

export type DraftType = z.infer<typeof draftTypeSchema>;

export const userDecisionSchema = z.enum([
  'approved',
  'edited',
  'rejected',
]);

export type UserDecision = z.infer<typeof userDecisionSchema>;

// ─── Table schemas (snake_case matching DB columns) ──────────────────────────
// Strict mode ensures no extra fields slip through from API responses

export const missionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  type: missionTypeSchema,
  title: z.string(),
  status: missionStatusSchema,
  goal: z.string(),
  listing_id: z.string().uuid().nullable(),
  idempotency_key: z.string().nullable(),
  input: z.record(z.unknown()),           // initial parameters passed to executor
  state: z.record(z.unknown()),           // accumulated step outputs (persisted per step)
  result: z.record(z.unknown()).nullable(), // final output after all steps complete
  current_step_index: z.number().int(),   // next step to run on resume
  campus_id: z.string().uuid().nullable(), // optional campus context for step queries
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
