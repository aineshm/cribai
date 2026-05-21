/**
 * Service-role Supabase helpers for E2E tests that need to read or clean up
 * server-side state (conversation_state JSONB, tour_requests rows).
 *
 * Uses SUPABASE_SECRET_KEY from .env.local — bypasses RLS so tests can assert
 * on rows the test user owns without first authenticating the helper itself.
 *
 * Keep this thin: only the operations the four AIN-32 tour-HITL assertions
 * actually need. Do not turn this into a general-purpose ORM.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadTestEnvOnce } from './load-test-env';

let cachedAdmin: SupabaseClient | null = null;

function adminClient(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  loadTestEnvOnce();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      'db-assertions: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in env',
    );
  }
  cachedAdmin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedAdmin;
}

export interface PendingActionShape {
  readonly kind: 'tour' | 'contact_pm' | 'sublease_publish' | 'mission' | null;
  readonly payload: Record<string, unknown> | null;
}

export interface ConversationStateShape {
  readonly mode: string;
  readonly selectedListingId: string | null;
  readonly pendingAction: PendingActionShape;
  readonly lastSearch: {
    readonly resultListingIds: readonly string[];
  };
}

/**
 * Read `conversation_state` JSONB for a conversation. Returns null when the
 * conversation does not exist (e.g. server hasn't persisted it yet — caller
 * should retry).
 */
export async function getConversationState(
  conversationId: string,
): Promise<ConversationStateShape | null> {
  const { data, error } = await adminClient()
    .from('conversations')
    .select('conversation_state')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) {
    throw new Error(`getConversationState failed: ${error.message}`);
  }
  if (!data) return null;
  return data.conversation_state as ConversationStateShape;
}

/**
 * Count pending tour_requests rows for a user+listing combination.
 *
 * Use this to assert "preview phase did NOT write" (expect 0) and
 * "publish phase DID write" (expect 1). Filtering on user_id + listing_id +
 * status='pending' matches the unique constraint scope so one user/listing
 * combination contributes at most one pending row.
 */
export async function countPendingTourRequests(
  userId: string,
  listingId: string,
): Promise<number> {
  const { count, error } = await adminClient()
    .from('tour_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .eq('status', 'pending');
  if (error) {
    throw new Error(`countPendingTourRequests failed: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Remove pending tour_requests so subsequent test runs do not collide with
 * the unique constraint (idx_tour_requests_dedup). Idempotent.
 */
export async function deletePendingTourRequests(
  userId: string,
  listingId: string,
): Promise<void> {
  const { error } = await adminClient()
    .from('tour_requests')
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .eq('status', 'pending');
  if (error) {
    throw new Error(`deletePendingTourRequests failed: ${error.message}`);
  }
}

/**
 * Delete a conversation (cascades to messages). Use in afterEach so each
 * test starts from a clean slate without relying on previous-turn state.
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const { error } = await adminClient()
    .from('conversations')
    .delete()
    .eq('id', conversationId);
  if (error) {
    throw new Error(`deleteConversation failed: ${error.message}`);
  }
}

/**
 * Poll getConversationState until it returns a row (server-side persistence
 * lags the SSE stream by a tick on a fresh conversation). Throws if the row
 * never materializes within timeoutMs.
 */
export async function waitForConversationState(
  conversationId: string,
  timeoutMs = 8_000,
  pollMs = 250,
): Promise<ConversationStateShape> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getConversationState(conversationId);
    if (state) return state;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    `waitForConversationState: conversation ${conversationId} never persisted after ${timeoutMs}ms`,
  );
}

/**
 * Poll until the conversation_state's pendingAction.kind matches the
 * expected value (or null). Returns the final state.
 *
 * Use this to wait out the gap between the chat showing the preview
 * card in the DOM and the server-side conversation_state JSONB write
 * completing — there's no client-side signal that the persist round-trip
 * has landed.
 */
export async function waitForPendingActionKind(
  conversationId: string,
  expectedKind: 'tour' | 'contact_pm' | 'sublease_publish' | 'mission' | null,
  timeoutMs = 10_000,
  pollMs = 250,
): Promise<ConversationStateShape> {
  const start = Date.now();
  let last: ConversationStateShape | null = null;
  while (Date.now() - start < timeoutMs) {
    last = await getConversationState(conversationId);
    if (last && last.pendingAction.kind === expectedKind) {
      return last;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    `waitForPendingActionKind: expected pendingAction.kind=${expectedKind}, last saw ${JSON.stringify(
      last?.pendingAction ?? null,
    )} after ${timeoutMs}ms`,
  );
}
