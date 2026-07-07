/**
 * AIN-93 live-eval harness — per-scenario `conversations` row.
 *
 * `/api/conversations` is cookie-only (recon fact 5) while the chat route
 * itself is Bearer-only, so the harness cannot use the REST endpoint to
 * create a conversation. Instead it inserts the row directly via a
 * service-role client — the same pattern `.crm-e2e.mjs` uses for CRM
 * fixtures — so prod's real persistence path (`resolveConversation` /
 * `persistAssistantResponse` in the route) runs for every turn.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_TITLE = 'AIN-93 live-eval';

export interface CreateConversationOptions {
  readonly userId: string;
  readonly title?: string;
}

/** Insert a fresh `conversations` row owned by `userId`. Returns its id. */
export async function createConversationRow(
  supabase: SupabaseClient,
  options: CreateConversationOptions,
): Promise<string> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: options.userId, title: options.title ?? DEFAULT_TITLE })
    .select('id')
    .single();

  if (error || !data || typeof (data as { id?: unknown }).id !== 'string') {
    throw new Error(
      `AIN-93: failed to create a conversations row: ${error?.message ?? 'no id returned'}`,
    );
  }

  return (data as { id: string }).id;
}

/**
 * Delete a per-scenario conversation row after a run. Never throws — a
 * cleanup failure shouldn't crash the harness mid-report; it's logged and
 * left for a future sweep.
 */
export async function deleteConversationRow(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  const { error } = await supabase.from('conversations').delete().eq('id', conversationId);
  if (error) {
    console.warn(`[ain93] failed to delete conversations row ${conversationId}: ${error.message}`);
  }
}
