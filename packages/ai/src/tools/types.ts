import type { ChatBlock } from '@campusnest/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ToolContext {
  readonly supabase: SupabaseClient;
  readonly campusId: string;
  readonly campusSlug: string;
  readonly userId?: string;
}

export interface ToolResult {
  readonly modelContext: string;
  readonly clientBlock: ChatBlock;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext,
) => Promise<ToolResult>;
