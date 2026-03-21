import { NextRequest } from 'next/server';
import { after } from 'next/server';
import { cookies } from 'next/headers';
import { createSecretClient } from '@campusnest/supabase/server';
import { CribAI, classifyIntent, shouldClassify, executeMission } from '@campusnest/ai';
import type { ChatEvent } from '@campusnest/ai';
import type { PageIndexNode } from '@campusnest/types';
import { isDevAuthEnabled, getDevUserById, DEFAULT_DEV_USER, DEV_USER_COOKIE } from '../../../../lib/dev-auth';

// ErrorEvent is route-local — the AI engine never emits errors, only the route does.
interface ErrorEvent {
  readonly type: 'error';
  readonly message: string;
}
type SSEEvent = ChatEvent | ErrorEvent;

// ---------------------------------------------------------------------------
// Type guard: distinguish new structured ChatEvents from old string yields
// ---------------------------------------------------------------------------
function isStructuredEvent(value: unknown): value is SSEEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string'
  );
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
} as const;

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// History parsing — accepts both old and new formats
// Old: [{role: 'user', content: 'text'}]
// New: [{role: 'user', blocks: [{type: 'text', content: 'text'}]}]
// ---------------------------------------------------------------------------
interface HistoryBlock {
  readonly type: string;
  readonly content?: string;
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

const GUEST_MAX_QUERY_LENGTH = 220;
const AUTH_MAX_QUERY_LENGTH = 500;
const GUEST_MAX_HISTORY_MESSAGES = 4;
const AUTH_MAX_HISTORY_MESSAGES = 12;
const GUEST_MAX_HISTORY_CHARS = 240;
const AUTH_MAX_HISTORY_CHARS = 800;

function parseHistory(
  history: unknown,
): ReadonlyArray<{ readonly role: 'user' | 'model'; readonly content: string }> {
  if (!Array.isArray(history)) return [];

  return (history as Array<Record<string, unknown>>)
    .filter((m) => typeof m === 'object' && m !== null)
    .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'model')
    .map((m) => {
      const role: 'user' | 'model' = m.role === 'assistant' ? 'model' : m.role === 'model' ? 'model' : 'user';

      // Old format: content is a plain string
      if (typeof m.content === 'string') {
        return { role, content: m.content };
      }

      // New format: blocks array with typed content blocks
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

// ---------------------------------------------------------------------------
// Rate-limiting check via ai_query_logs (inline, no edge-function call)
// ---------------------------------------------------------------------------
const RATE_LIMITS: Record<string, { readonly maxRequests: number; readonly windowMinutes: number }> = {
  free: { maxRequests: 10, windowMinutes: 60 },
  pro: { maxRequests: 50, windowMinutes: 60 },
  premium: { maxRequests: 200, windowMinutes: 60 },
};

interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
}

async function checkRateLimit(
  supabase: ReturnType<typeof createSecretClient>,
  userId: string,
  tier: string,
): Promise<RateLimitResult> {
  const limit = RATE_LIMITS[tier] ?? RATE_LIMITS['free']!;
  const windowStart = new Date(Date.now() - limit.windowMinutes * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('ai_query_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart);

  const remaining = Math.max(0, limit.maxRequests - (count ?? 0));
  return { allowed: remaining > 0, remaining };
}

// ---------------------------------------------------------------------------
// POST /api/ai/cribai
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { query, campusSlug, history, bounds, listingId, conversationId } = body;

    const validConversationId =
      typeof conversationId === 'string' && /^[0-9a-f-]{36}$/i.test(conversationId)
        ? conversationId
        : null;

    // --- Input validation ---------------------------------------------------
    if (typeof query !== 'string' || typeof campusSlug !== 'string') {
      return jsonError('Missing query or campusSlug', 400);
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return jsonError('Query is required', 400);
    }

    // Gemini client auto-detects: GOOGLE_CLOUD_PROJECT → Vertex AI, else GEMINI_API_KEY → AI Studio
    if (!process.env.GOOGLE_CLOUD_PROJECT && !process.env.GEMINI_API_KEY) {
      return jsonError('AI service not configured', 503);
    }

    // --- Supabase client + auth context -------------------------------------
    const supabase = createSecretClient();

    // Try to extract authenticated user (optional — unauthenticated users
    // still get a limited experience but cannot schedule tours etc.)
    const authHeader = request.headers.get('authorization');
    let userId: string | null = null;
    let subscriptionTier = 'free';

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
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

    // Dev auth fallback — resolve userId from dev cookie when no bearer token
    // SECURITY: Hard-gate to prevent dev auth from leaking into production
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

    // --- Rate limiting (only for authenticated users) -----------------------
    if (userId) {
      const rateCheck = await checkRateLimit(supabase, userId, subscriptionTier);
      if (!rateCheck.allowed) {
        return jsonError('Rate limit exceeded. Please try again later.', 429);
      }
    }

    // --- Fetch campus -------------------------------------------------------
    const { data: campus } = await supabase
      .from('campus_configs')
      .select('id, name')
      .eq('slug', campusSlug)
      .single();

    if (!campus) {
      return jsonError('Campus not found', 404);
    }

    // --- Fetch PageIndex tree -----------------------------------------------
    const { data: treeRow } = await supabase
      .from('pageindex_trees')
      .select('tree')
      .eq('campus_id', campus.id)
      .eq('entity_type', 'listings_overview')
      .single();

    const tree: PageIndexNode = treeRow?.tree ?? {
      label: 'root',
      summary: 'No data yet',
      contentRef: null,
      children: [],
    };

    // --- Parse conversation history -----------------------------------------
    const conversationHistory = clampHistory(parseHistory(history), isGuest);

    // --- Build ToolContext for the new engine --------------------------------
    // Parse optional map viewport bounds for geographic filtering
    // SECURITY: Validate shape to prevent NaN in arithmetic filters
    function isValidBounds(v: unknown): v is { minLat: number; maxLat: number; minLng: number; maxLng: number } {
      if (!v || typeof v !== 'object') return false;
      const b = v as Record<string, unknown>;
      return (
        typeof b.minLat === 'number' && typeof b.maxLat === 'number' &&
        typeof b.minLng === 'number' && typeof b.maxLng === 'number'
      );
    }
    const mapBounds = isValidBounds(bounds) ? bounds : undefined;

    const toolContext = {
      supabase,
      campusId: campus.id as string,
      campusSlug,
      userId: userId ?? undefined,
      allowedToolNames: isGuest ? GUEST_ALLOWED_TOOLS : undefined,
      mapBounds,
    };

    // --- Initialize CribAI --------------------------------------------------
    const cribai = new CribAI({
      campusName: campus.name,
      toolContext,
    });

    // --- Classify intent (before stream, non-blocking on error) -------------
    // Only propose missions for intents that have registered handlers.
    // lease_analysis can be classified but has no handler — skip it.
    const REGISTERED_MISSION_INTENTS = new Set(['housing_search', 'tour_outreach', 'listing_deep_dive', 'sublease_post']);

    let intentProposal: { intent: string; confidence: number; extractedFields: Record<string, unknown> } | null = null;
    if (!isGuest && shouldClassify(trimmedQuery)) {
      const intentResult = await classifyIntent(trimmedQuery);
      if (
        intentResult.confidence > 0.75 &&
        intentResult.intent !== 'general_chat' &&
        REGISTERED_MISSION_INTENTS.has(intentResult.intent)
      ) {
        intentProposal = {
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          extractedFields: intentResult.extracted_fields,
        };
      }
    }

    // --- Pre-fetch listing context (when listingId is provided) ---------------
    let listingContext = '';
    if (typeof listingId === 'string' && listingId.length > 0) {
      const { data: listing } = await supabase
        .from('listings')
        .select('id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, fairness_data, true_cost, true_cost_total, amenities, available_date, source, description')
        .eq('id', listingId)
        .eq('campus_id', campus.id)
        .eq('is_active', true)
        .single();

      if (listing) {
        const trueCost = listing.true_cost as Record<string, number> | null;
        const fairnessData = listing.fairness_data as Record<string, unknown> | null;
        const amenities = Array.isArray(listing.amenities) ? listing.amenities : [];
        listingContext = [
          `\n\n[LISTING CONTEXT — the user is asking about this specific listing]`,
          `Address: ${listing.address}`,
          `Rent: $${listing.rent_monthly}/mo | ${listing.bedrooms ?? '?'} bed / ${listing.bathrooms ?? '?'} bath / ${listing.sqft ?? '?'} sqft`,
          `Source: ${listing.source}`,
          `Amenities: ${amenities.length > 0 ? amenities.join(', ') : 'none listed'}`,
          `Available: ${listing.available_date ?? 'Not specified'}`,
          listing.description ? `Description: ${listing.description}` : '',
          trueCost ? `True Cost: rent=$${trueCost['rent'] ?? 0}, utilities=$${trueCost['utilities'] ?? 0}, total=$${trueCost['total'] ?? 0}/mo` : '',
          fairnessData ? `Fairness: ${listing.fairness_score ?? 'N/A'}/10` : '',
          `listing_id: ${listing.id}`,
        ].filter(Boolean).join('\n');
      }
    }

    // If no explicit listingId but we have a conversation, check conversation.context
    if (!listingContext && validConversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('context')
        .eq('id', validConversationId)
        .single();

      const ctxListingId = (conv?.context as Record<string, unknown>)?.listing_id;
      if (typeof ctxListingId === 'string' && ctxListingId.length > 0) {
        const { data: listing } = await supabase
          .from('listings')
          .select('id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, fairness_data, true_cost, true_cost_total, amenities, available_date, source, description')
          .eq('id', ctxListingId)
          .eq('campus_id', campus.id)
          .eq('is_active', true)
          .single();

        if (listing) {
          const trueCost = listing.true_cost as Record<string, number> | null;
          const fairnessData = listing.fairness_data as Record<string, unknown> | null;
          const amenities = Array.isArray(listing.amenities) ? listing.amenities : [];
          listingContext = [
            `\n\n[LISTING CONTEXT — continuing conversation about this listing]`,
            `Address: ${listing.address}`,
            `Rent: $${listing.rent_monthly}/mo | ${listing.bedrooms ?? '?'} bed / ${listing.bathrooms ?? '?'} bath / ${listing.sqft ?? '?'} sqft`,
            `Source: ${listing.source}`,
            `Amenities: ${amenities.length > 0 ? amenities.join(', ') : 'none listed'}`,
            `Available: ${listing.available_date ?? 'Not specified'}`,
            listing.description ? `Description: ${listing.description}` : '',
            trueCost ? `True Cost: rent=$${trueCost['rent'] ?? 0}, utilities=$${trueCost['utilities'] ?? 0}, total=$${trueCost['total'] ?? 0}/mo` : '',
            fairnessData ? `Fairness: ${listing.fairness_score ?? 'N/A'}/10` : '',
            `listing_id: ${listing.id}`,
          ].filter(Boolean).join('\n');
        }
      }
    }

    // --- Stream response with structured SSE events -------------------------
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const enrichedQuery = listingContext
            ? `${trimmedQuery}${listingContext}`
            : trimmedQuery;
          const chatArgs = { query: enrichedQuery, tree, conversationHistory };
          let toolProposedMission = false;
          const serverBlocks: Array<Record<string, unknown>> = [];
          let currentServerText = '';

          for await (const chunk of cribai.chat(chatArgs)) {
            if (typeof chunk === 'string') {
              // Old engine yields plain strings — wrap as TextEvent
              controller.enqueue(encoder.encode(sseEncode({ type: 'text', content: chunk })));
              currentServerText += chunk;
            } else if (isStructuredEvent(chunk)) {
              // Suppress engine's done — we emit our own after mission_proposal
              if (chunk.type === 'done') continue;

              // Detect propose_mission tool results and re-emit as top-level mission_proposal
              if (
                chunk.type === 'tool_result' &&
                'block' in chunk &&
                chunk.block.type === 'text'
              ) {
                try {
                  const parsed = JSON.parse(chunk.block.content) as Record<string, unknown>;
                  if (parsed._missionProposal === true) {
                    toolProposedMission = true;
                    const proposalEvent: ChatEvent = {
                      type: 'mission_proposal',
                      intent: parsed.intent as string,
                      confidence: 1,
                      extractedFields: (parsed.extractedFields ?? {}) as Record<string, unknown>,
                    };
                    controller.enqueue(encoder.encode(sseEncode(proposalEvent)));
                    continue; // Don't also emit the raw tool_result
                  }
                } catch {
                  // Not JSON or not a mission proposal — fall through to normal emit
                }
              }

              // Detect mission_request from tool handlers and auto-create missions
              // SECURITY: Validate missionType against registered intents to prevent injection
              if (chunk.type === 'mission_request' && userId && REGISTERED_MISSION_INTENTS.has(chunk.missionType)) {
                const serviceClient = createSecretClient();
                const missionTitle = chunk.missionType.replace(/_/g, ' ');
                const { data: mission } = await serviceClient
                  .from('missions')
                  .insert({
                    user_id: userId,
                    campus_id: campus.id,
                    type: chunk.missionType,
                    title: missionTitle.charAt(0).toUpperCase() + missionTitle.slice(1),
                    goal: `Auto-created from ${chunk.missionType} tool`,
                    input: chunk.input,
                    status: 'pending',
                  })
                  .select('id')
                  .single();

                if (mission) {
                  controller.enqueue(encoder.encode(sseEncode({
                    type: 'mission_created',
                    missionId: mission.id as string,
                  })));

                  after(async () => {
                    await executeMission({ missionId: mission.id as string });
                  });
                }
                continue;
              }

              // Flush accumulated text before pushing a non-text block
              if (chunk.type !== 'text' && currentServerText) {
                serverBlocks.push({ type: 'text', content: currentServerText });
                currentServerText = '';
              }

              // Track text content server-side
              if (chunk.type === 'text' && 'content' in chunk) {
                currentServerText += (chunk as { content?: string }).content ?? '';
              }

              // Track tool_result blocks server-side
              if (chunk.type === 'tool_result' && 'block' in chunk && (chunk as { block?: unknown }).block) {
                serverBlocks.push((chunk as { block: Record<string, unknown> }).block);
              }

              // New engine yields ChatEvent objects — pass through
              controller.enqueue(encoder.encode(sseEncode(chunk)));
            }
          }

          // Flush any remaining accumulated text
          if (currentServerText) {
            serverBlocks.push({ type: 'text', content: currentServerText });
            currentServerText = '';
          }

          // Emit classifier mission_proposal before done (skip if tool already proposed one)
          if (intentProposal && !toolProposedMission) {
            const proposalEvent: ChatEvent = {
              type: 'mission_proposal',
              intent: intentProposal.intent,
              confidence: intentProposal.confidence,
              extractedFields: intentProposal.extractedFields,
            };
            controller.enqueue(encoder.encode(sseEncode(proposalEvent)));
          }

          // Emit done last — client uses this as the signal to stop reading.
          // Always emit since we suppress the engine's done above.
          controller.enqueue(encoder.encode(sseEncode({ type: 'done' })));
          controller.close();

          // --- Server-side assistant persistence ---
          if (validConversationId && userId && serverBlocks.length > 0) {
            const blocksToSave = serverBlocks.filter(b => b.type !== 'tool_loading');
            const resolvedListingId = typeof listingId === 'string' ? listingId : null;

            after(async () => {
              try {
                const svc = createSecretClient();

                await svc.from('messages').insert({
                  conversation_id: validConversationId,
                  role: 'assistant',
                  blocks: blocksToSave,
                  metadata: resolvedListingId ? { listing_id: resolvedListingId } : {},
                });

                const preview = blocksToSave
                  .filter((b): b is { type: string; content: string } => b.type === 'text' && typeof b.content === 'string')
                  .map(b => b.content)
                  .join(' ')
                  .slice(0, 100);

                const updatePayload: Record<string, unknown> = {
                  updated_at: new Date().toISOString(),
                };
                if (preview) {
                  updatePayload.last_message_preview = preview.length >= 100 ? `${preview.slice(0, 97)}...` : preview;
                }
                if (resolvedListingId) {
                  updatePayload.context = { listing_id: resolvedListingId };
                }

                await svc.from('conversations').update(updatePayload).eq('id', validConversationId);
              } catch (err) {
                console.error('[cribai] after() persistence failed:', err);
              }
            });
          }

          // --- Log the query (fire-and-forget) ------------------------------
          if (userId) {
            void supabase.from('ai_query_logs').insert({
              user_id: userId,
              campus_id: campus.id,
              query: trimmedQuery,
            });
          }
        } catch (err) {
          const raw =
            err instanceof Error ? err.message : 'Stream error';
          // Detect Gemini quota / rate-limit errors and return a friendly message
          const isQuotaError =
            raw.includes('RESOURCE_EXHAUSTED') ||
            raw.includes('429') ||
            raw.includes('quota');
          const message = isQuotaError
            ? 'CribAI is temporarily unavailable due to high demand. Please try again in a minute.'
            : raw;
          controller.enqueue(
            encoder.encode(sseEncode({ type: 'error', message })),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch {
    return jsonError('Internal server error', 500);
  }
}
