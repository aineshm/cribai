import type { ChatBlock, ConversationState } from '@campusnest/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ToolName =
  | 'search_listings'
  | 'get_listing_detail'
  | 'compare_listings'
  | 'schedule_tour'
  | 'explain_lease_term'
  | 'get_landlord_info'
  | 'get_saved_listings'
  | 'web_search'
  | 'get_reviews'
  | 'contact_pm'
  | 'get_neighborhood_info'
  | 'create_sublease'
  | 'propose_mission';

export interface MapBounds {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

export interface ToolContext {
  readonly supabase: SupabaseClient;
  readonly campusId: string;
  readonly campusSlug: string;
  readonly userId?: string;
  readonly allowedToolNames?: readonly ToolName[];
  readonly mapBounds?: MapBounds;
  /**
   * AIN-9 review FIX 2 — side-effect kill-switch for the eval runner.
   *
   * When `true`, side-effecting handlers (currently `schedule_tour` and
   * `create_sublease` Phase 2) MUST skip the real DB insert / external
   * action and return a synthetic success result of the same shape. This is
   * the boundary defense against an eval run landing real `tour_requests` /
   * `listings` rows when the model drives a confirmed HITL flow with the
   * service-role client.
   *
   * The eval HITL scorer detects leaks POST-HOC; `dryRun` PREVENTS them at
   * the handler edge. Live runtime never sets this — production traffic is
   * always `dryRun=false` (the default).
   *
   * Read-only handlers ignore this flag entirely.
   */
  readonly dryRun?: boolean;
}

export interface ToolResult<TMachine = Record<string, unknown>> {
  readonly machineData?: TMachine;
  readonly modelContext: string;
  readonly clientBlock: ChatBlock;
  readonly mapBlock?: ChatBlock;
  readonly statePatch?: Partial<ConversationState>;
  readonly missionRequest?: {
    readonly type: string;
    readonly input: Readonly<Record<string, unknown>>;
  };
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext,
) => Promise<ToolResult>;
