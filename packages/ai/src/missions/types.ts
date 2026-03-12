import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Mission Step Definitions ──────────────────────────────────────

/** A single step in a mission's execution pipeline. */
export interface MissionStep {
  /** Slug identifier, e.g. 'search_listings' */
  readonly id: string;
  /** Human-readable label, e.g. 'Searching listings' */
  readonly label: string;
  /** Optional CribAI tool name for logging purposes */
  readonly tool?: string;
  /** Execute this step with the given context */
  run(ctx: StepContext): Promise<StepResult>;
}

/** Context injected into each step's run function. All fields are readonly. */
export interface StepContext {
  readonly missionId: string;
  readonly userId: string;
  readonly campusId: string;
  readonly campusSlug: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly state: Readonly<Record<string, unknown>>;
  readonly supabase: SupabaseClient;
}

/** Result returned by a step's run function. */
export interface StepResult {
  /** Output merged into accumulated state for subsequent steps */
  readonly output: Readonly<Record<string, unknown>>;
  /** If present, executor pauses for HITL approval */
  readonly draft?: DraftPayload;
  /** If true, mission completes after this step (skip remaining steps) */
  readonly done?: boolean;
}

/** Payload for a HITL draft that requires user approval. */
export interface DraftPayload {
  readonly draftType: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

// ─── Mission Definition ──────────────────────────────────────

/** A registered mission type with its ordered step pipeline. */
export interface MissionDefinition {
  readonly type: string;
  readonly steps: readonly MissionStep[];
}

// ─── Executor Options ──────────────────────────────────────

/** Options passed to executeMission. */
export interface ExecuteOptions {
  readonly missionId: string;
  /** Step index to resume from. Defaults to the mission's current_step_index. */
  readonly startFromStep?: number;
}
