/**
 * CampusNest AI Concierge Types
 *
 * DB-aligned type definitions for the AI Concierge mission system.
 * Re-exports from @campusnest/types (Zod-validated, snake_case matching DB columns).
 *
 * Backward-compatible aliases are provided for existing mock-backed components.
 * These aliases are deprecated and will be removed in Phase 20.
 */

import type { Mission, MissionLog, MissionDraft, MissionStatus, MissionType } from '@campusnest/types';

// ─── DB-aligned types (Phase 16+) ──────────────────────────────────────────

export type {
  Mission,
  MissionLog,
  MissionDraft,
  MissionSteering,
  MissionStatus,
  MissionType,
  ExecutionLogStatus,
  DraftType,
  UserDecision,
} from '@campusnest/types';

// ─── Primary UI type for Phase 29+ ───────────────────────────────────────────

/**
 * Enriched mission shape for Concierge UI components.
 * Combines DB Mission with its related logs and current draft.
 */
export interface MissionWithDetails extends Mission {
  readonly logs: readonly MissionLog[];
  readonly currentDraft: MissionDraft | null;
}

// ─── Deprecated aliases for existing mock-backed components ──────────────────
// These will be removed in Phase 20 when components migrate to DB-backed data.

/**
 * @deprecated Use `MissionLog` instead. Will be removed in Phase 20.
 */
export interface ExecutionLog {
  readonly timestamp: string;
  readonly action: string;
  readonly detail: string;
  readonly status: 'success' | 'pending' | 'error';
}

/**
 * @deprecated Use `DraftType` instead. Will be removed in Phase 20.
 */
export type ActionCardType =
  | 'tour_scheduled'
  | 'draft_ready'
  | 'negotiation_update'
  | 'comparison_ready';

/**
 * @deprecated Use `MissionDraft` instead. Will be removed in Phase 20.
 */
export interface ActionCard {
  readonly type: ActionCardType;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * @deprecated Use `Mission` (DB-aligned, snake_case) instead. Will be removed in Phase 20.
 *
 * Legacy mission shape used by mock-backed components (MissionCard, MissionDetail, etc.).
 * Uses camelCase fields and embedded logs/actionCard that are separate tables in the DB.
 */
export interface LegacyMission {
  readonly id: string;
  readonly type: MissionType;
  readonly title: string;
  readonly status: MissionStatus;
  readonly listingTitle: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly summary: string;
  readonly logs: readonly ExecutionLog[];
  readonly actionCard?: ActionCard;
}

