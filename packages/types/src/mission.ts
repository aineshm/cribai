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
  'queued',            // enqueued for worker pickup
  'pending',           // created, not yet picked up by executor
  'running',           // executor is actively processing steps
  'retrying',          // step failed with a retryable error
  'active',            // legacy v1.0 status (manual missions)
  'paused',            // user paused execution
  'waiting_approval',  // executor paused for HITL draft approval
  'scheduled',         // queued to run at a future time
  'completed',         // all steps finished successfully
  'failed',            // step threw or draft was rejected
  'cancelled',         // user cancelled or rejected the workflow
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
  'listing_deep_dive',
  'sublease_post',
  'crm_deep_extract',
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
  attempt_count: z.number().int(),
  leased_until: z.string().nullable(),
  last_heartbeat_at: z.string().nullable(),
  last_error: z.string().nullable(),
  step_attempts: z.record(z.string(), z.number().int()),
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

// ─── Housing Search Mission ───────────────────────────────────────────────────

export const housingSearchInputSchema = z.object({
  bedrooms: z.number().int().min(0).optional(),
  maxRent: z.number().positive().optional(),
  moveInDate: z.string().optional(),           // YYYY-MM-DD
  dealbreakers: z.array(z.string()).optional(),
  preferences: z.string().optional(),          // free text e.g. 'quiet, natural light'
  topN: z.number().int().min(1).max(10).default(5),
});

export type HousingSearchInput = z.infer<typeof housingSearchInputSchema>;

export const researchedListingSchema = z.object({
  id: z.string().uuid(),
  address: z.string(),
  rentMonthly: z.number(),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  sqft: z.number().nullable(),
  amenities: z.array(z.string()),
  photoUrls: z.array(z.string()),
  fairnessScore: z.number().nullable(),        // 1-10 from DB
  reviewRating: z.number().nullable(),         // 1-5 from Google Places
  reviewSnippet: z.string().nullable(),
  walkScore: z.number().nullable(),            // 0-100 from Walk Score
  preferenceScore: z.number().nullable(),      // 0-10 from Gemini scoring
});

export type ResearchedListing = z.infer<typeof researchedListingSchema>;

export const shortlistItemSchema = z.object({
  rank: z.number().int().min(1),
  listingId: z.string().uuid(),
  address: z.string(),
  rentMonthly: z.number(),
  compositeScore: z.number().min(0).max(1),   // 0-1 weighted composite
  fairnessScore: z.number().nullable(),
  reviewRating: z.number().nullable(),
  walkScore: z.number().nullable(),
  preferenceScore: z.number().nullable(),
  reasoning: z.string(),
});

export type ShortlistItem = z.infer<typeof shortlistItemSchema>;

export const shortlistReportSchema = z.object({
  missionId: z.string().uuid(),
  generatedAt: z.string(),                    // ISO timestamp
  totalSearched: z.number().int(),
  items: z.array(shortlistItemSchema),
});

export type ShortlistReport = z.infer<typeof shortlistReportSchema>;
