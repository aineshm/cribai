/**
 * CampusNest AI Concierge Types
 *
 * Type definitions for the AI Concierge mission system.
 * All data is mock — no backend integration.
 */

export type MissionStatus =
  | 'active'
  | 'waiting_approval'
  | 'scheduled'
  | 'completed'
  | 'failed';

export type MissionType =
  | 'tour_booking'
  | 'lease_review'
  | 'landlord_outreach'
  | 'price_negotiation'
  | 'listing_comparison';

export type ExecutionLogStatus = 'success' | 'pending' | 'error';

export interface ExecutionLog {
  readonly timestamp: string;
  readonly action: string;
  readonly detail: string;
  readonly status: ExecutionLogStatus;
}

export type ActionCardType =
  | 'tour_scheduled'
  | 'draft_ready'
  | 'negotiation_update'
  | 'comparison_ready';

export interface ActionCard {
  readonly type: ActionCardType;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface Mission {
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
