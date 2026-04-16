import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createSecretClient } from '@campusnest/supabase/server';
import { CribAI } from '@campusnest/ai';
import type { ChatEvent } from '@campusnest/ai';
import {
  createEmptyConversationState,
  mergeConversationState,
  normalizeConversationState,
  type ChatBlock,
  type ConversationState,
  type PageIndexNode,
} from '@campusnest/types';
import { maybeHandleDeterministicTurn } from '../../../../lib/cribai-runtime';
import {
  isDevAuthEnabled,
  getDevUserById,
  DEFAULT_DEV_USER,
  DEV_USER_COOKIE,
} from '../../../../lib/dev-auth';

interface ErrorEvent {
  readonly type: 'error';
  readonly message: string;
}

type SSEEvent = ChatEvent | ErrorEvent;

interface HistoryBlock {
  readonly type: string;
  readonly content?: string;
}

interface VerifiedConversation {
  readonly id: string;
  readonly context: Record<string, unknown>;
  readonly conversationState: ConversationState;
}

type GuestToolName =
  | 'search_listings'
  | 'get_listing_detail'
  | 'compare_listings'
  | 'explain_lease_term';

const GUEST_ALLOWED_TOOLS: readonly GuestToolName[] = [
  'search_listings',
  'get_listing_detail',
  'compare_listings',
  'explain_lease_term',
] as const;

const REGISTERED_MISSION_INTENTS = new Set([
  'housing_search',
  'tour_outreach',
  'listing_deep_dive',
  'sublease_post',
]);

const GUEST_MAX_QUERY_LENGTH = 220;
const AUTH_MAX_QUERY_LENGTH = 500;
const GUEST_MAX_HISTORY_MESSAGES = 4;
const AUTH_MAX_HISTORY_MESSAGES = 12;
const GUEST_MAX_HISTORY_CHARS = 240;
const AUTH_MAX_HISTORY_CHARS = 800;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const;

const RATE_LIMITS: Record<string, { readonly maxRequests: number; readonly windowMinutes: number }> = {
  free: { maxRequests: 10, windowMinutes: 60 },
  pro: { maxRequests: 50, windowMinutes: 60 },
  premium: { maxRequests: 200, windowMinutes: 60 },
};

interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
}

function isStructuredEvent(value: unknown): value is SSEEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string'
  );
}

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseHistory(
  history: unknown,
): ReadonlyArray<{ readonly role: 'user' | 'model'; readonly content: string }> {
  if (!Array.isArray(history)) return [];

  return (history as Array<Record<string, unknown>>)
    .filter((m) => typeof m === 'object' && m !== null)
    .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'model')
    .map((m) => {
      const role: 'user' | 'model' =
        m.role === 'assistant' ? 'model' : m.role === 'model' ? 'model' : 'user';

      if (typeof m.content === 'string') {
        return { role, content: m.content };
      }

      if (Array.isArray(m.blocks)) {
        const content = (m.blocks as ReadonlyArray<HistoryBlock>)
          .filter((b) => b.type === 'text')
          .map((b) => b.content ?? '')
          .join('\n');
        return { role, content };
      }

      return { role, content: '' };
    });
}

function clampHistory(
  history: ReadonlyArray<{ readonly role: 'user' | 'model'; readonly content: string }>,
  isGuest: boolean,
): ReadonlyArray<{ readonly role: 'user' | 'model'; readonly content: string }> {
  const maxMessages = isGuest ? GUEST_MAX_HISTORY_MESSAGES : AUTH_MAX_HISTORY_MESSAGES;
  const maxChars = isGuest ? GUEST_MAX_HISTORY_CHARS : AUTH_MAX_HISTORY_CHARS;

  return history.slice(-maxMessages).map((message) => ({
    ...message,
    content: message.content.slice(0, maxChars),
  }));
}

function isValidBounds(v: unknown): v is { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.minLat === 'number' &&
    typeof b.maxLat === 'number' &&
    typeof b.minLng === 'number' &&
    typeof b.maxLng === 'number'
  );
}

function buildConversationPreview(blocks: readonly Record<string, unknown>[]): string | null {
  const preview = blocks
    .filter(
      (block): block is { readonly type: string; readonly content: string } =>
        block.type === 'text' && typeof block.content === 'string',
    )
    .map((block) => block.content)
    .join(' ')
    .trim();

  if (!preview) {
    return null;
  }

  return preview.length > 100 ? `${preview.slice(0, 97)}...` : preview;
}

async function checkRateLimit(
  supabase: ReturnType<typeof createSecretClient>,
  userId: string,
  tier: string,
): Promise<RateLimitResult> {
  const limit = RATE_LIMITS[tier] ?? RATE_LIMITS.free!;
  const windowStart = new Date(Date.now() - limit.windowMinutes * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('ai_query_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart);

  const remaining = Math.max(0, limit.maxRequests - (count ?? 0));
  return { allowed: remaining > 0, remaining };
}

async function resolveConversation(
  supabase: ReturnType<typeof createSecretClient>,
  conversationId: string | null,
  userId: string | null,
): Promise<VerifiedConversation | null> {
  if (!conversationId || !userId) {
    return null;
  }

  let row: {
    id: string;
    context: Record<string, unknown> | null;
    conversation_state: unknown;
  } | null = null;

  for (let attempt = 0; attempt < 3 && !row; attempt++) {
    const { data } = await supabase
      .from('conversations')
      .select('id, context, conversation_state')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    row = (data as {
      id: string;
      context: Record<string, unknown> | null;
      conversation_state: unknown;
    } | null) ?? null;
    if (!row && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 50 * Math.pow(3, attempt)));
    }
  }

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    context: (row.context ?? {}) as Record<string, unknown>,
    conversationState: normalizeConversationState(row.conversation_state),
  };
}

async function enqueueMission(
  supabase: ReturnType<typeof createSecretClient>,
  args: {
    readonly userId: string;
    readonly campusId: string;
    readonly missionType: string;
    readonly input: Readonly<Record<string, unknown>>;
  },
): Promise<string | null> {
  const missionTitle = args.missionType.replace(/_/g, ' ');
  const { data, error } = await supabase
    .from('missions')
    .insert({
      user_id: args.userId,
      campus_id: args.campusId,
      type: args.missionType,
      title: missionTitle.charAt(0).toUpperCase() + missionTitle.slice(1),
      goal: `Auto-created from ${args.missionType} tool`,
      input: args.input,
      status: 'queued',
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[cribai] Failed to enqueue mission:', error);
    return null;
  }

  return data.id as string;
}

async function persistAssistantResponse(args: {
  readonly supabase: ReturnType<typeof createSecretClient>;
  readonly conversationId: string | null;
  readonly userId: string | null;
  readonly blocks: readonly Record<string, unknown>[];
  readonly conversationState: ConversationState;
}) {
  if (!args.conversationId || !args.userId) {
    return;
  }

  const blocksToSave = args.blocks.filter((block) => block.type !== 'tool_loading');
  const preview = buildConversationPreview(blocksToSave);
  const selectedListingId = args.conversationState.selectedListingId;

  if (blocksToSave.length > 0) {
    await args.supabase.from('messages').insert({
      conversation_id: args.conversationId,
      role: 'assistant',
      blocks: blocksToSave,
      metadata: selectedListingId ? { listing_id: selectedListingId } : {},
    });
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    conversation_state: args.conversationState,
    context: selectedListingId ? { listing_id: selectedListingId } : {},
  };

  if (preview) {
    updatePayload.last_message_preview = preview;
  }

  await args.supabase.from('conversations').update(updatePayload).eq('id', args.conversationId);
}

async function fetchPageIndexTree(
  supabase: ReturnType<typeof createSecretClient>,
  campusId: string,
): Promise<PageIndexNode> {
  const { data: treeRow } = await supabase
    .from('pageindex_trees')
    .select('tree')
    .eq('campus_id', campusId)
    .eq('entity_type', 'listings_overview')
    .single();

  return (treeRow?.tree as PageIndexNode | undefined) ?? {
    label: 'root',
    summary: 'No data yet',
    contentRef: null,
    children: [],
  };
}

function enqueueEvent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: SSEEvent,
) {
  controller.enqueue(encoder.encode(sseEncode(event)));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { query, campusSlug, history, bounds, listingId, conversationId } = body;

    const validConversationId =
      typeof conversationId === 'string' && /^[0-9a-f-]{36}$/i.test(conversationId)
        ? conversationId
        : null;

    if (typeof query !== 'string' || typeof campusSlug !== 'string') {
      return jsonError('Missing query or campusSlug', 400);
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return jsonError('Query is required', 400);
    }

    if (!process.env.GOOGLE_CLOUD_PROJECT && !process.env.GEMINI_API_KEY) {
      return jsonError('AI service not configured', 503);
    }

    const supabase = createSecretClient();
    const authHeader = request.headers.get('authorization');
    let userId: string | null = null;
    let subscriptionTier = 'free';

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;

        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_tier')
          .eq('id', user.id)
          .single();

        subscriptionTier = (profile?.subscription_tier as string) ?? 'free';
      }
    }

    if (!userId && process.env.NODE_ENV !== 'production' && isDevAuthEnabled()) {
      const cookieStore = await cookies();
      const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
      const devUser = selectedId ? getDevUserById(selectedId) : DEFAULT_DEV_USER;
      userId = devUser?.id ?? DEFAULT_DEV_USER.id;
    }

    const isGuest = !userId;
    const maxQueryLength = isGuest ? GUEST_MAX_QUERY_LENGTH : AUTH_MAX_QUERY_LENGTH;
    if (trimmedQuery.length > maxQueryLength) {
      return jsonError(`Query too long (max ${maxQueryLength} chars)`, 400);
    }

    if (userId) {
      const rateCheck = await checkRateLimit(supabase, userId, subscriptionTier);
      if (!rateCheck.allowed) {
        return jsonError('Rate limit exceeded. Please try again later.', 429);
      }
    }

    const { data: campus } = await supabase
      .from('campus_configs')
      .select('id, name')
      .eq('slug', campusSlug)
      .single();

    if (!campus) {
      return jsonError('Campus not found', 404);
    }

    const mapBounds = isValidBounds(bounds) ? bounds : undefined;
    const verifiedConversation = await resolveConversation(supabase, validConversationId, userId);
    let conversationState = verifiedConversation?.conversationState ?? createEmptyConversationState();
    const legacyConversationListingId =
      typeof verifiedConversation?.context?.listing_id === 'string'
        ? (verifiedConversation.context.listing_id as string)
        : null;
    const explicitListingId = typeof listingId === 'string' && listingId.length > 0 ? listingId : null;
    const effectiveListingId =
      explicitListingId ?? conversationState.selectedListingId ?? legacyConversationListingId;

    if (effectiveListingId) {
      conversationState = mergeConversationState(conversationState, {
        selectedListingId: effectiveListingId,
        mode: conversationState.mode === 'browse' ? 'listing_detail' : conversationState.mode,
      });
    }

    const toolContext = {
      supabase,
      campusId: campus.id as string,
      campusSlug,
      userId: userId ?? undefined,
      allowedToolNames: isGuest ? GUEST_ALLOWED_TOOLS : undefined,
      mapBounds,
    };

    const deterministicResult = await maybeHandleDeterministicTurn({
      query: trimmedQuery,
      toolContext,
      conversationState,
      listingId: effectiveListingId,
    });

    const encoder = new TextEncoder();

    if (deterministicResult) {
      const nextConversationState = deterministicResult.conversationState;
      const assistantBlocks = deterministicResult.blocks.filter(
        (block) => block.type !== 'tool_loading',
      ) as readonly ChatBlock[];

      const stream = new ReadableStream({
        async start(controller) {
          try {
            for (const event of deterministicResult.events) {
              enqueueEvent(controller, encoder, event);
            }

            enqueueEvent(controller, encoder, { type: 'done' });
            controller.close();

            await persistAssistantResponse({
              supabase,
              conversationId: verifiedConversation?.id ?? null,
              userId,
              blocks: assistantBlocks as readonly Record<string, unknown>[],
              conversationState: nextConversationState,
            });

            if (userId) {
              void supabase.from('ai_query_logs').insert({
                user_id: userId,
                campus_id: campus.id,
                query: trimmedQuery,
              });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Stream error';
            enqueueEvent(controller, encoder, { type: 'error', message });
            controller.close();
          }
        },
      });

      return new Response(stream, { headers: SSE_HEADERS });
    }

    const tree = await fetchPageIndexTree(supabase, campus.id as string);
    const conversationHistory = clampHistory(parseHistory(history), isGuest);
    const cribai = new CribAI({
      campusName: campus.name,
      toolContext,
    });

    const stream = new ReadableStream({
      async start(controller) {
        let nextConversationState = conversationState;
        let toolProposedMission = false;
        const serverBlocks: Array<Record<string, unknown>> = [];
        let currentServerText = '';

        try {
          for await (const chunk of cribai.chat({
            query: trimmedQuery,
            tree,
            conversationHistory,
          })) {
            if (typeof chunk === 'string') {
              enqueueEvent(controller, encoder, { type: 'text', content: chunk });
              currentServerText += chunk;
              continue;
            }

            if (!isStructuredEvent(chunk)) {
              continue;
            }

            if (chunk.type === 'done') {
              continue;
            }

            if (chunk.type === 'tool_result' && 'statePatch' in chunk && chunk.statePatch) {
              nextConversationState = mergeConversationState(
                nextConversationState,
                chunk.statePatch,
              );
            }

            if (chunk.type === 'tool_result' && 'block' in chunk && chunk.block.type === 'text') {
              try {
                const parsed = JSON.parse(chunk.block.content) as Record<string, unknown>;
                if (parsed._missionProposal === true) {
                  toolProposedMission = true;
                  enqueueEvent(controller, encoder, {
                    type: 'mission_proposal',
                    intent: parsed.intent as string,
                    confidence: 1,
                    extractedFields: (parsed.extractedFields ?? {}) as Record<string, unknown>,
                  });
                  continue;
                }
              } catch {
                // Non-JSON text blocks pass through normally.
              }
            }

            if (
              chunk.type === 'mission_request' &&
              userId &&
              REGISTERED_MISSION_INTENTS.has(chunk.missionType)
            ) {
              const missionId = await enqueueMission(supabase, {
                userId,
                campusId: campus.id as string,
                missionType: chunk.missionType,
                input: chunk.input,
              });

              if (missionId) {
                nextConversationState = mergeConversationState(nextConversationState, {
                  mode: 'mission',
                  pendingAction: {
                    kind: 'mission',
                    payload: {
                      missionId,
                      missionType: chunk.missionType,
                    },
                  },
                });
                enqueueEvent(controller, encoder, {
                  type: 'mission_created',
                  missionId,
                });
              }
              continue;
            }

            if (chunk.type !== 'text' && currentServerText) {
              serverBlocks.push({ type: 'text', content: currentServerText });
              currentServerText = '';
            }

            if (chunk.type === 'text' && 'content' in chunk) {
              currentServerText += chunk.content ?? '';
            }

            if (chunk.type === 'tool_result' && 'block' in chunk && chunk.block) {
              serverBlocks.push(chunk.block as Record<string, unknown>);
            }

            enqueueEvent(controller, encoder, chunk);
          }

          if (currentServerText) {
            serverBlocks.push({ type: 'text', content: currentServerText });
          }

          if (!toolProposedMission) {
            nextConversationState = mergeConversationState(nextConversationState, {
              pendingAction: nextConversationState.pendingAction.kind === 'mission'
                ? nextConversationState.pendingAction
                : { kind: null, payload: null },
            });
          }

          enqueueEvent(controller, encoder, { type: 'done' });
          controller.close();

          await persistAssistantResponse({
            supabase,
            conversationId: verifiedConversation?.id ?? null,
            userId,
            blocks: serverBlocks,
            conversationState: nextConversationState,
          });

          if (userId) {
            void supabase.from('ai_query_logs').insert({
              user_id: userId,
              campus_id: campus.id,
              query: trimmedQuery,
            });
          }
        } catch (err) {
          const raw = err instanceof Error ? err.message : 'Stream error';
          const isQuotaError =
            raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429') || raw.includes('quota');
          enqueueEvent(controller, encoder, {
            type: 'error',
            message: isQuotaError
              ? 'CribAI is temporarily unavailable due to high demand. Please try again in a minute.'
              : raw,
          });
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch {
    return jsonError('Internal server error', 500);
  }
}
