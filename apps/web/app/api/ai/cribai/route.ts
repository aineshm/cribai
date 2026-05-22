import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createSecretClient } from '@campusnest/supabase/server';
import {
  CribAI,
  createRequestMetricsRecorder,
  resolveRequestId,
  type ChatEvent,
  type RequestMetricsRecorder,
} from '@campusnest/ai';
import {
  createEmptyConversationState,
  mergeConversationState,
  normalizeConversationState,
  type ChatBlock,
  type ConversationState,
  type PageIndexNode,
} from '@campusnest/types';
import { maybeHandleDeterministicTurn } from '../../../../lib/cribai-runtime';
import { preservePendingActionAfterLLMTurn } from '../../../../lib/conversation-state-helpers';
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

function isGenericOrSearchQuery(query: string): boolean {
  const q = query.toLowerCase().trim();

  // Generic search keywords or general prompts that indicate a broad search or navigation
  const genericTriggers = [
    'find', 'search', 'show me', 'list of', 'apartments near', 'subleases near',
    'sublets near', 'available subleases', 'available apartments', 'any listings',
    'browse', 'where can i live', 'looking for a', 'apartments in', 'subleases in',
    'show listings', 'search listings', 'show map', 'view map', 'what\'s available',
    'anything near', 'matching'
  ];

  if (genericTriggers.some(trigger => q.includes(trigger))) {
    return true;
  }

  // General chat/greetings that are definitely not listing specific
  const genericChat = [
    'hello', 'hi ', 'hey ', 'who are you', 'how do i use', 'what can you do',
    'how does this work', 'how to use', 'help', 'what is cribai'
  ];
  if (genericChat.some(trigger => q.startsWith(trigger) || q === trigger.trim())) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  // AIN-19 — stamp request_received_at at handler entry, before any IO.
  // The recorder is created once we have a Supabase client. Until then,
  // hold the entry timestamp + request_id so the recorder reflects the
  // true handler-entry moment, not "post-validation".
  const requestReceivedAt = new Date();
  const requestId = resolveRequestId(request.headers.get('x-request-id'));
  let metricsRecorder: RequestMetricsRecorder | null = null;

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

    // AIN-19 codex P2 follow-up — create the metrics recorder NOW so all
    // post-auth early-returns (query_too_long, rate_limit, campus_not_found)
    // still produce a baseline row tagged with the appropriate `error_kind`.
    // Conversation id is not resolved until later; pass null for now and
    // accept the gap — that field is informational, not required by the
    // schema. Earlier, pre-supabase failures (JSON parse, missing query,
    // env not configured) are intentionally not instrumented because they
    // happen before we even have a Supabase client to persist to; those
    // remain visible via Vercel access logs.
    metricsRecorder = createRequestMetricsRecorder(
      {
        requestId,
        userId,
        conversationId: null,
        runtime: 'deterministic',
        requestReceivedAt,
      },
      supabase,
    );

    const isGuest = !userId;
    const maxQueryLength = isGuest ? GUEST_MAX_QUERY_LENGTH : AUTH_MAX_QUERY_LENGTH;
    if (trimmedQuery.length > maxQueryLength) {
      // AWAIT the insert on early-return paths — serverless runtimes (Vercel
      // notably) cancel unawaited background work the moment the function
      // returns, which would silently drop the very rows this branch exists
      // to capture.
      await metricsRecorder.finish({ errorKind: 'query_too_long' });
      return jsonError(`Query too long (max ${maxQueryLength} chars)`, 400);
    }

    if (userId) {
      const rateCheck = await checkRateLimit(supabase, userId, subscriptionTier);
      if (!rateCheck.allowed) {
        await metricsRecorder.finish({ errorKind: 'rate_limit' });
        return jsonError('Rate limit exceeded. Please try again later.', 429);
      }
    }

    const { data: campus } = await supabase
      .from('campus_configs')
      .select('id, name')
      .eq('slug', campusSlug)
      .single();

    if (!campus) {
      await metricsRecorder.finish({ errorKind: 'campus_not_found' });
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
    let effectiveListingId =
      explicitListingId ?? conversationState.selectedListingId ?? legacyConversationListingId;

    // Clear context ONLY if this turn is a generic search / greeting AND we have no pending actions/tours
    const isGenericOrSearch = isGenericOrSearchQuery(trimmedQuery);
    const hasPendingAction = !!conversationState.pendingAction?.kind;

    if (explicitListingId) {
      // Explicitly targeted listing card click/selection always sets active context
      conversationState = mergeConversationState(conversationState, {
        selectedListingId: explicitListingId,
        mode: conversationState.mode === 'browse' ? 'listing_detail' : conversationState.mode,
      });
    } else if (isGenericOrSearch && !hasPendingAction) {
      // Clear context on generic search turns
      effectiveListingId = null;
      conversationState = mergeConversationState(conversationState, {
        selectedListingId: null,
        mode: conversationState.mode === 'listing_detail' ? 'browse' : conversationState.mode,
      });
    } else if (effectiveListingId) {
      // Maintain context for follow-up turns
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

    // AIN-19 — the recorder was created earlier so it can cover early-return
    // error paths (query_too_long, rate_limit, campus_not_found). Now that the
    // conversation row has been resolved, late-bind the id so success-path
    // rows carry it. `runtime: 'deterministic'` labels the entire current code
    // path; AIN-8 will swap this label for 'llm_first' when its turn handler
    // ships.
    metricsRecorder?.setConversationId(verifiedConversation?.id ?? null);

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
          // AIN-19 — track whether assistant content shipped (text or
          // tool_result). Card-only deterministic flows (e.g. tour_submit)
          // ship only tool_result, so they still qualify; a degenerate
          // empty event list does not.
          let emittedAssistantContent = false;
          try {
            for (const event of deterministicResult.events) {
              // AIN-19 — record tool calls + first-tool-result timing as we
              // replay the deterministic event sequence. firstModelTokenAt is
              // intentionally left null on the deterministic path — those
              // turns short-circuit Gemini entirely, so a TTFT measurement
              // would be misleading. The 'deterministic' runtime label in
              // the row makes this distinction queryable downstream.
              if (event.type === 'tool_call') {
                metricsRecorder?.recordToolCall(event.name);
              } else if (event.type === 'tool_result') {
                metricsRecorder?.markFirstToolResult();
                emittedAssistantContent = true;
              } else if (event.type === 'text') {
                emittedAssistantContent = true;
              }
              enqueueEvent(controller, encoder, event);
            }

            // AIN-19 — stamp final_assistant_message_at right before the
            // 'done' marker hits the wire. Card-only deterministic flows
            // qualify via the emittedAssistantContent flag.
            if (emittedAssistantContent) {
              metricsRecorder?.markFinalAssistantMessage();
            }
            enqueueEvent(controller, encoder, { type: 'done' });
            controller.close();

            // AIN-19 — stamp request_completed_at NOW so the row's latency
            // reflects only client-visible work, then run the metrics insert
            // and the conversation persist in PARALLEL via Promise.all. Both
            // must be awaited to keep the function alive (guest / first-turn
            // turns leave persistAssistantResponse as a no-op, so it cannot
            // be the sole keepalive — codex P1 from push #3). Running them
            // concurrently rather than serially avoids widening the
            // stale-conversation race window where a fast follow-up turn
            // reads stale conversation_state (codex P2 from push #4).
            // Per-promise .catch keeps a persist failure from rejecting the
            // Promise.all and from being swallowed silently.
            metricsRecorder?.markCompleted();
            const persistPromise = persistAssistantResponse({
              supabase,
              conversationId: verifiedConversation?.id ?? null,
              userId,
              blocks: assistantBlocks as readonly Record<string, unknown>[],
              conversationState: nextConversationState,
            }).catch((persistErr) => {
              console.error('[cribai] post-stream persistence failed:', persistErr);
            });
            const metricsPromise = metricsRecorder?.finish() ?? Promise.resolve();
            await Promise.all([persistPromise, metricsPromise]);

            if (userId) {
              void supabase.from('ai_query_logs').insert({
                user_id: userId,
                campus_id: campus.id,
                query: trimmedQuery,
              });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Stream error';
            // Reaches here if the SSE replay itself throws. AWAIT finish()
            // FIRST so a cancelled SSE connection cannot silently drop the
            // deterministic_stream_error row (codex P2 from push #4 — the
            // previous order put controller calls first, which would throw
            // on a closed stream and skip finish()). The error event +
            // controller.close() are wrapped in a try/catch so a no-longer-
            // writable controller doesn't bubble the error out of the
            // ReadableStream start() callback.
            await metricsRecorder?.finish({ errorKind: 'deterministic_stream_error' });
            try {
              enqueueEvent(controller, encoder, { type: 'error', message });
              controller.close();
            } catch (controllerErr) {
              console.error('[cribai] controller already closed:', controllerErr);
            }
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
        // AIN-19 — track whether the model actually emitted any assistant
        // payload (text or tool_result). Empty/blocked Gemini replies that
        // yield only `done` should leave final_assistant_message_at null.
        let emittedAssistantContent = false;

        try {
          for await (const chunk of cribai.chat({
            query: trimmedQuery,
            tree,
            conversationHistory,
          })) {
            if (typeof chunk === 'string') {
              // AIN-19 — string chunks are streamed text from the model. Stamp
              // TTFT here (idempotent) so the row reflects real model output.
              metricsRecorder?.markFirstModelToken();
              enqueueEvent(controller, encoder, { type: 'text', content: chunk });
              currentServerText += chunk;
              emittedAssistantContent = true;
              continue;
            }

            if (!isStructuredEvent(chunk)) {
              continue;
            }

            if (chunk.type === 'done') {
              // AIN-19 codex P2 follow-up — `done` is a control marker, not a
              // model emission. Skip BEFORE stamping TTFT so empty/blocked
              // Gemini replies that only yield `done` leave
              // first_model_token_at null (consistent with the
              // emittedAssistantContent discipline used for
              // final_assistant_message_at below).
              continue;
            }

            // AIN-19 — track tool invocations + first-tool-result timing.
            // (final_assistant_message_at is stamped once after the loop,
            // right before controller.close(), gated on
            // emittedAssistantContent so empty/blocked Gemini replies keep
            // it null while card-only LLM turns still get it.)
            if (chunk.type === 'tool_call') {
              // tool_call is a real model emission — stamp TTFT.
              metricsRecorder?.markFirstModelToken();
              metricsRecorder?.recordToolCall(chunk.name);
            } else if (chunk.type === 'tool_result') {
              metricsRecorder?.markFirstModelToken();
              metricsRecorder?.markFirstToolResult();
              emittedAssistantContent = true;
            } else if (chunk.type === 'text') {
              metricsRecorder?.markFirstModelToken();
              emittedAssistantContent = true;
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
            nextConversationState = preservePendingActionAfterLLMTurn(
              nextConversationState,
              trimmedQuery,
            );
          }

          // AIN-19 — stamp final_assistant_message_at only when assistant
          // content actually shipped. Card-only LLM turns qualify; empty/
          // blocked Gemini replies that yield only `done` do not, so the
          // marker stays null and downstream can detect those turns.
          if (emittedAssistantContent) {
            metricsRecorder?.markFinalAssistantMessage();
          }
          enqueueEvent(controller, encoder, { type: 'done' });
          controller.close();

          // AIN-19 — see the deterministic-path comment above for the full
          // rationale. Same pattern: markCompleted freezes the timestamp,
          // then metrics + persist run in PARALLEL so the conversation row
          // isn't blocked behind the metrics insert (codex P2 from push
          // #4).
          metricsRecorder?.markCompleted();
          const persistPromise = persistAssistantResponse({
            supabase,
            conversationId: verifiedConversation?.id ?? null,
            userId,
            blocks: serverBlocks,
            conversationState: nextConversationState,
          }).catch((persistErr) => {
            console.error('[cribai] post-stream persistence failed:', persistErr);
          });
          const metricsPromise = metricsRecorder?.finish() ?? Promise.resolve();
          await Promise.all([persistPromise, metricsPromise]);

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
          // AWAIT finish() FIRST so a cancelled SSE connection cannot drop
          // the gemini_quota / llm_stream_error row (codex P2 from push
          // #4). Controller calls are wrapped in try/catch so a
          // no-longer-writable controller doesn't bubble out of start().
          await metricsRecorder?.finish({
            errorKind: isQuotaError ? 'gemini_quota' : 'llm_stream_error',
          });
          try {
            enqueueEvent(controller, encoder, {
              type: 'error',
              message: isQuotaError
                ? 'CribAI is temporarily unavailable due to high demand. Please try again in a minute.'
                : raw,
            });
            controller.close();
          } catch (controllerErr) {
            console.error('[cribai] controller already closed:', controllerErr);
          }
        }
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch {
    // AIN-19 — outer catch (e.g. JSON parse failure, env missing). Recorder
    // may or may not exist depending on which validation step threw. Await
    // the persist for the same reason as the early-return branches above:
    // there's no later awaited work to keep the serverless function alive
    // for a fire-and-forget insert. `await undefined` is a safe no-op so
    // optional chaining behaves correctly when the recorder isn't built yet.
    await metricsRecorder?.finish({ errorKind: 'handler_exception' });
    return jsonError('Internal server error', 500);
  }
}
