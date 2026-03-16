import type { ChatBlock } from '@campusnest/types';
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
  | 'get_neighborhood_info';

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
}

export interface ToolResult {
  readonly modelContext: string;
  readonly clientBlock: ChatBlock;
  readonly mapBlock?: ChatBlock;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext,
) => Promise<ToolResult>;
