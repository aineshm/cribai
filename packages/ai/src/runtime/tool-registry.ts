/**
 * PDR-004 Track A Day 1 — Tool Registry
 *
 * Re-exposes the existing 13 CribAI tools as Vercel AI SDK `tool()` definitions
 * for the LLM-first conversational layer.
 *
 * Each entry pairs:
 *   - `description`: copied (with light HITL annotations) from the existing
 *     `@google/genai` `FunctionDeclaration` so the LLM-side `when_to_call` hint
 *     stays consistent with what the deterministic runtime already documents.
 *   - `inputSchema`: a Zod schema mirroring the handler's internal validator
 *     (handlers re-parse on entry — these are not relied upon for trust, but
 *     they shape what the LLM emits).
 *   - `execute`: a thin closure that calls the existing handler via
 *     `executeTool` so HITL/auth/logging/allowlist behavior in
 *     `packages/ai/src/tools/executor.ts` is preserved unchanged.
 *
 * This file does NOT modify any handler. The Day 10 cutover that deletes
 * `apps/web/lib/cribai-runtime.ts` re-routes the LLM-first turn handler
 * through this registry.
 */

import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { executeTool } from '../tools/executor';
import type { ToolContext, ToolName, ToolResult } from '../tools/types';

// ---------------------------------------------------------------------------
// Input schemas (mirror handler-internal Zod schemas)
// ---------------------------------------------------------------------------

const searchListingsInput = z.object({
  semantic_query: z.string().optional(),
  address: z.string().optional(),
  bedrooms: z.number().int().min(0).max(10).optional(),
  min_rent: z.number().min(0).optional(),
  max_rent: z.number().min(0).optional(),
  min_fairness: z.number().min(1).max(10).optional(),
  amenities: z.array(z.string()).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'fairness', 'relevance']).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

const getListingDetailInput = z.object({
  listing_id: z.string().uuid(),
});

const compareListingsInput = z.object({
  listing_ids: z.array(z.string().uuid()).min(2).max(4),
});

const scheduleTourInput = z.object({
  listing_id: z.string().uuid(),
  student_name: z.string().trim().min(1).max(200),
  student_email: z.string().email(),
  preferred_dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'))
    .min(1)
    .max(10),
  notes: z.string().max(500).optional(),
  // HITL gate — mirrors `createSubleaseInput.confirmed` so the safety boundary
  // is visible on the tool schema rather than hidden in handler behavior.
  // Phase 1 (confirmed=false or omitted): handler returns a tour preview for
  // the user to review. Phase 2 (confirmed=true): handler dispatches the
  // external tour request. See PDR-004 codex cross-review amendment A1.
  // AIN-26: `.default(false)` so a model that OMITS the field can never
  // accidentally trip the HITL gate — an omitted `confirmed` is preview, not
  // publish. The handler re-parses and re-checks `confirmed === true`.
  confirmed: z.boolean().default(false),
});

const explainLeaseTermInput = z.object({
  term: z.string().trim().min(1),
  context: z.string().optional(),
});

const getLandlordInfoInput = z.object({
  landlord_id: z.string().uuid().optional(),
  listing_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
});

const getSavedListingsInput = z.object({
  sort: z.enum(['saved_date', 'price_asc', 'price_desc', 'fairness']).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

const webSearchInput = z.object({
  query: z.string(),
  location: z.string().optional(),
});

const getReviewsInput = z.object({
  listing_id: z.string().uuid().optional(),
  address: z.string().optional(),
});

const contactPmInput = z.object({
  listing_id: z.string().uuid(),
  message: z.string().max(500).optional(),
});

const getNeighborhoodInfoInput = z.object({
  address: z.string().optional(),
  listing_id: z.string().uuid().optional(),
  topics: z.array(z.string()).optional(),
});

const createSubleaseInput = z.object({
  address: z.string().min(5).max(200),
  bedrooms_total: z.number().int().min(0).max(10),
  bedrooms_available: z.number().int().min(0).max(10),
  contact_email: z.string().email().optional(),
  rent_monthly: z.number().positive().max(10000).optional().nullable(),
  bathrooms: z.number().min(0).max(10).optional(),
  available_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  available_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(2000).optional(),
  amenities: z.array(z.string()).optional(),
  unit_number: z.string().max(20).optional(),
  furnished: z.boolean().optional(),
  parking: z.boolean().optional(),
  property_type: z.enum(['apartment', 'house', 'room']).optional(),
  gender_restriction: z.string().max(50).optional(),
  roommate_info: z.string().max(200).optional(),
  // AIN-26: `.default(false)` — same HITL-safety rationale as
  // `scheduleTourInput.confirmed`. An omitted `confirmed` means preview.
  confirmed: z.boolean().default(false),
});

const proposeMissionInput = z.object({
  intent: z.enum(['housing_search', 'tour_outreach', 'listing_deep_dive', 'sublease_post']),
  bedrooms: z.number().int().min(0).max(10).optional(),
  max_rent: z.number().positive().max(20000).optional(),
  location: z.string().max(200).optional(),
  move_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// `when_to_call` descriptions
//
// Copied from packages/ai/src/tools/schemas.ts so the LLM-side guidance stays
// in lock-step with the deterministic runtime during the transition. The two
// HITL tools (`schedule_tour`, `create_sublease`) carry an explicit reminder
// that the handler will refuse to take external action without `confirmed`.
// ---------------------------------------------------------------------------

const DESCRIPTIONS: Readonly<Record<ToolName, string>> = {
  search_listings:
    'Search for student housing listings AND subleases near campus. Use this when the user wants to find apartments or subleases — e.g., "find me a 2-bedroom", "show me subleases", "summer housing under $1200". Use semantic_query for natural language searches like "sublease summer" or "quiet place near campus". ALWAYS call this tool immediately when the user asks about listings or subleases — do not ask clarifying questions first.',

  get_listing_detail:
    'Get full details for a specific listing including true cost breakdown and fairness analysis. Use when the user asks for more details about a specific listing.',

  compare_listings:
    'Compare 2-4 listings side by side. Use when the user wants to compare specific apartments.',

  schedule_tour:
    'Schedule a tour for a specific listing. Two-phase HITL flow: call WITHOUT `confirmed` (or `confirmed=false`) to render a preview card (listing + dates + email) for the student to review. After the student confirms in their next turn, call AGAIN with `confirmed=true` AND ALL the same fields to actually submit the request. Required fields: `listing_id`, `student_name`, `student_email`, `preferred_dates`. Do not claim the tour is booked in your prose until the handler returns a tour_confirmation block.',

  explain_lease_term:
    'Explain a lease or rental term. Use when the user asks about lease clauses, tenant rights, or rental terminology.',

  get_landlord_info:
    'Get landlord information and review summary. Use when the user asks about a landlord or property management company.',

  get_saved_listings:
    "Get the user's saved/favorited listings. Use when the user asks about their saved listings, favorites, or references 'my saved', 'my favorites'.",

  web_search:
    'Search the web for rental listings and housing information when the local database does not have enough results. Use this when search_listings returns fewer than 1 unique property matching the query, or when the user explicitly asks to search the web.',

  get_reviews:
    'Get reviews and community feedback for a property or landlord. Use when the user asks about reviews, ratings, or tenant experiences for a listing.',

  contact_pm:
    'Send a message or inquiry to a property manager. Use when the user wants to contact a landlord or property manager about a listing.',

  get_neighborhood_info:
    'Get neighborhood information including walkability, safety, commute times, and local vibe. Use when the user asks about the area around a listing.',

  create_sublease:
    'Create a sublease listing on CribAI. This is a two-phase tool:\n' +
    'Phase 1 (confirmed=false): Validates extracted fields and returns a formatted preview for the user to review.\n' +
    'Phase 2 (confirmed=true): Publishes the listing after user confirms. You MUST re-send ALL fields, not just confirmed=true.\n\n' +
    'Before calling this tool, collect the required fields from conversation:\n' +
    '- address (required)\n' +
    '- bedrooms_total + bedrooms_available (required)\n' +
    'For optional fields, ask naturally: rent ("Would you like to put a price?"), dates, unit number.\n' +
    "If the user does not provide contact_email, their account email will be used.\n" +
    'HITL: the handler will refuse to publish unless `confirmed=true`. Never claim the listing is live until the handler returns a publish-confirmation block.',

  propose_mission:
    'Propose a background mission when the student describes a complex, multi-step housing need ' +
    '(e.g., comprehensive apartment search with many criteria, scheduling multiple tours, comparing ' +
    'many options). Do NOT propose missions for simple questions that a single tool call can answer.',
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Factory: build a registry of Vercel AI SDK `tool()` definitions bound to a
 * specific `ToolContext`. The context (Supabase client, campusId, userId,
 * allowlist) is closed over by each `execute` closure so the LLM-first turn
 * handler can pass the registry directly to `streamText`/`generateText`.
 */
export type ToolRegistry = Readonly<Record<ToolName, Tool>>;

/**
 * Out-of-band sink for the full `ToolResult`. PDR-004 codex P1 (PR #69): the
 * model must only ever receive the string `modelContext` from a tool call —
 * NOT the `clientBlock`, `statePatch`, `machineData`, `mapBlock`, or
 * `missionRequest`. Those are UI/state side-channels the turn loop consumes
 * directly. The registry pushes the full result here BEFORE returning the
 * string to the SDK.
 *
 * The sink receives the SDK-provided `toolCallId` so the turn loop can
 * correlate EXACTLY with the stream's `tool-result` part (which carries the
 * same id). Keying by id — not by tool name — is robust even when the SDK
 * runs multiple calls to the same tool in parallel within one step and they
 * complete out of call order.
 */
export type ToolResultSink = (
  toolCallId: string,
  toolName: ToolName,
  result: ToolResult,
) => void;

/**
 * PDR-004 codex P2 (AIN-8): per-turn tool-execution budget.
 *
 * The Vercel AI SDK's `stepCountIs` stop condition caps model ROUND-TRIPS, not
 * individual tool executions: when the model emits several tool calls in a
 * SINGLE step, the SDK runs ALL of their `execute` closures before re-checking
 * the stop condition. That bypasses the legacy deterministic path's per-turn
 * tool-call cap (5 authenticated / 2 guest), so one turn could fire many tool
 * executions in parallel — cost blowup, and `propose_mission` auto-creates
 * mission rows (queue spam).
 *
 * `ToolCallBudget` is a small mutable counter threaded into `buildToolRegistry`
 * from `runLlmTurn`. The `execute` wrapper checks-and-increments it
 * SYNCHRONOUSLY (before any `await`) so parallel calls within one step cannot
 * race past the limit. Once `count` reaches `limit`, the wrapper does NOT call
 * `executeTool` (no side effect, no mission row) and does NOT fire the sink —
 * it just hands the model a short notice string. This is applied IN ADDITION
 * to (and after) the executor's guest allowlist + HITL `confirmed` gating.
 */
export interface ToolCallBudget {
  /** Max tool executions allowed this turn (5 auth / 2 guest). */
  readonly limit: number;
  /** Executions consumed so far this turn. Mutated by the registry. */
  count: number;
}

/** Model-facing notice when the per-turn tool-call budget is exhausted. */
const BUDGET_EXHAUSTED_MESSAGE = 'Tool call limit reached for this turn.';

export function buildToolRegistry(
  context: ToolContext,
  sink: ToolResultSink,
  budget?: ToolCallBudget,
): ToolRegistry {
  const make = <T extends z.ZodTypeAny>(
    name: ToolName,
    inputSchema: T,
  ): Tool =>
    tool({
      description: DESCRIPTIONS[name],
      inputSchema,
      // The Vercel AI SDK passes the parsed input through. We re-hand to the
      // existing executor so HITL/auth/logging/allowlist behavior is reused
      // unchanged. The executor may THROW (guest-disallowed tool, unknown
      // tool, handler failure) — we let that propagate so the SDK emits a
      // `tool-error` part and the turn loop renders an error block. The sink
      // only fires on success, after which we hand the model ONLY the string
      // `modelContext`. The full ToolResult never reaches the model.
      execute: async (input, options): Promise<string> => {
        // codex P2: enforce the per-turn tool-execution cap at the `execute`
        // seam so it also covers PARALLEL calls within one step. This check +
        // increment runs SYNCHRONOUSLY before the first `await` — the SDK
        // invokes every parallel `execute` closure concurrently, and each runs
        // to its first suspension point synchronously, so an atomic
        // check-then-increment here prevents the (limit+1)-th call from
        // slipping through. When exhausted we DON'T call `executeTool` (no side
        // effect / no mission row) and DON'T fire the sink (no clientBlock
        // leak) — the model just gets a short notice string.
        if (budget) {
          if (budget.count >= budget.limit) {
            return BUDGET_EXHAUSTED_MESSAGE;
          }
          budget.count += 1;
        }
        const result = await executeTool(
          name,
          input as Record<string, unknown>,
          context,
        );
        sink(options.toolCallId, name, result);
        return result.modelContext;
      },
    });

  return Object.freeze({
    search_listings: make('search_listings', searchListingsInput),
    get_listing_detail: make('get_listing_detail', getListingDetailInput),
    compare_listings: make('compare_listings', compareListingsInput),
    schedule_tour: make('schedule_tour', scheduleTourInput),
    explain_lease_term: make('explain_lease_term', explainLeaseTermInput),
    get_landlord_info: make('get_landlord_info', getLandlordInfoInput),
    get_saved_listings: make('get_saved_listings', getSavedListingsInput),
    web_search: make('web_search', webSearchInput),
    get_reviews: make('get_reviews', getReviewsInput),
    contact_pm: make('contact_pm', contactPmInput),
    get_neighborhood_info: make('get_neighborhood_info', getNeighborhoodInfoInput),
    create_sublease: make('create_sublease', createSubleaseInput),
    propose_mission: make('propose_mission', proposeMissionInput),
  });
}

/**
 * Static metadata about the registry — names, descriptions, and Zod input
 * schemas — without binding to a `ToolContext`. Useful for snapshot tests,
 * prompt builders that need to enumerate tools, and Langfuse setup.
 */
export interface ToolSpec {
  readonly name: ToolName;
  readonly description: string;
  readonly inputSchema: z.ZodTypeAny;
}

export const TOOL_SPECS: readonly ToolSpec[] = Object.freeze([
  { name: 'search_listings', description: DESCRIPTIONS.search_listings, inputSchema: searchListingsInput },
  { name: 'get_listing_detail', description: DESCRIPTIONS.get_listing_detail, inputSchema: getListingDetailInput },
  { name: 'compare_listings', description: DESCRIPTIONS.compare_listings, inputSchema: compareListingsInput },
  { name: 'schedule_tour', description: DESCRIPTIONS.schedule_tour, inputSchema: scheduleTourInput },
  { name: 'explain_lease_term', description: DESCRIPTIONS.explain_lease_term, inputSchema: explainLeaseTermInput },
  { name: 'get_landlord_info', description: DESCRIPTIONS.get_landlord_info, inputSchema: getLandlordInfoInput },
  { name: 'get_saved_listings', description: DESCRIPTIONS.get_saved_listings, inputSchema: getSavedListingsInput },
  { name: 'web_search', description: DESCRIPTIONS.web_search, inputSchema: webSearchInput },
  { name: 'get_reviews', description: DESCRIPTIONS.get_reviews, inputSchema: getReviewsInput },
  { name: 'contact_pm', description: DESCRIPTIONS.contact_pm, inputSchema: contactPmInput },
  { name: 'get_neighborhood_info', description: DESCRIPTIONS.get_neighborhood_info, inputSchema: getNeighborhoodInfoInput },
  { name: 'create_sublease', description: DESCRIPTIONS.create_sublease, inputSchema: createSubleaseInput },
  { name: 'propose_mission', description: DESCRIPTIONS.propose_mission, inputSchema: proposeMissionInput },
]);

/** Tools whose handlers enforce a preview/confirm HITL gate. */
export const HITL_TOOLS: readonly ToolName[] = Object.freeze([
  'schedule_tour',
  'create_sublease',
]);
