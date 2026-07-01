/**
 * PDR-004 Track A Day 2 — System prompt builder
 *
 * Constructs the LLM-first system prompt as two segments:
 *
 *   1. `cachedPrefix` — byte-identical across turns within a campus. Order is
 *      strict: persona → tool schemas → policy. Suitable for Gemini explicit
 *      context caching (Day 5+) or implicit prefix caching.
 *   2. `dynamicSuffix` — per-turn state + per-user profile + (optional) guest
 *      guardrail + (optional) HITL reminder for pending actions.
 *
 * The builder is **vendor-agnostic**: it returns strings. Day 3-4 wires the
 * prefix into `@google/genai` `caches.create` (or whatever Gemini provider
 * lands) and concatenates the suffix per turn. Returning `{ cachedPrefix,
 * dynamicSuffix }` lets the caller decide composition vs. caching.
 *
 * Tool schemas are rendered as plain text (name + description + flat field
 * list with type + required marker), NOT as full JSON-Schema. The SDK passes
 * the real schemas to the model via the `tools` parameter; the prompt copy
 * is for the model's `when_to_call` reasoning, not for validation. Avoids
 * a `zod-to-json-schema` dep and keeps the prefix small.
 *
 * See PDR-004 §Architectural Shape and codex cross-review amendments A2/A3.
 */

import type { ConversationState } from '@campusnest/types';
import { z, type ZodTypeAny } from 'zod';
import { buildPersona, DEFAULT_CAMPUS_NAME } from './persona';
import { buildPolicyBlock } from './policy';
import { TOOL_SPECS, toolSpecsForSurface, type ToolSpec, type RuntimeSurface } from './tool-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Compact user-profile data threaded into the dynamic suffix. */
export interface UserProfileSnippet {
  /** Mapped from `user_metadata.full_name` (fallback: `display_name`). */
  readonly displayName: string | null;
  /** Mapped from `user_metadata.campus_slug` (fallback: `campus`). */
  readonly campusSlug: string | null;
}

export const EMPTY_PROFILE_SNIPPET: UserProfileSnippet = Object.freeze({
  displayName: null,
  campusSlug: null,
});

export interface BuildSystemPromptOptions {
  /** Campus the agent is operating in. Default: `UW-Madison`. */
  readonly campusName?: string;
  /**
   * True when the request has no authenticated user. Adds a guest guardrail
   * block to the DYNAMIC suffix so the invariant prefix stays cacheable
   * across signed-in and guest traffic.
   */
  readonly isGuest?: boolean;
  /**
   * Surface identifier. 'crm' = My Apartments workspace (scoped tool list +
   * saved-list RULE #1 + show_card guidance in the dynamic suffix). Absent =
   * explore/default (all 17 tools, search-first RULE #1). Byte-stable per
   * surface: the CRM prefix and the default prefix are each computed once at
   * call time from module-load constants.
   */
  readonly surface?: RuntimeSurface;
}

export interface SystemPromptParts {
  /** Persona + tool list + policy. Byte-identical across turns (cacheable). */
  readonly cachedPrefix: string;
  /** State + profile + per-turn reminders. Changes per turn. */
  readonly dynamicSuffix: string;
}

// ---------------------------------------------------------------------------
// Tool-list rendering (invariant — must be deterministic across turns)
// ---------------------------------------------------------------------------

/**
 * Render the Zod input schema as a flat field list. Only handles the shapes
 * the registry actually uses (`z.object` with primitive / array / enum /
 * optional fields). Falls back to `"<opaque>"` for unrecognized shapes so a
 * future schema change is loud rather than silent.
 */
function renderInputSchema(schema: ZodTypeAny): string {
  if (!(schema instanceof z.ZodObject)) {
    return '  (opaque input)';
  }

  const shape = schema.shape as Record<string, ZodTypeAny>;
  const fieldNames = Object.keys(shape).sort();
  if (fieldNames.length === 0) {
    return '  (no input)';
  }

  const lines = fieldNames.map((name) => {
    const fieldSchema = shape[name] as ZodTypeAny;
    const optional = isOptional(fieldSchema);
    const typeLabel = describeType(fieldSchema);
    return `  - ${name}: ${typeLabel}${optional ? ' (optional)' : ' (required)'}`;
  });
  return lines.join('\n');
}

function isOptional(schema: ZodTypeAny): boolean {
  return (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  );
}

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  let current = schema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault
  ) {
    current = current._def.innerType as ZodTypeAny;
  }
  return current;
}

function describeType(schema: ZodTypeAny): string {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodString) return 'string';
  if (inner instanceof z.ZodNumber) return 'number';
  if (inner instanceof z.ZodBoolean) return 'boolean';
  if (inner instanceof z.ZodEnum) {
    const values = (inner._def.values as readonly string[]).join(' | ');
    return `enum(${values})`;
  }
  if (inner instanceof z.ZodArray) {
    const elem = describeType(inner._def.type as ZodTypeAny);
    return `array<${elem}>`;
  }
  if (inner instanceof z.ZodObject) return 'object';
  if (inner instanceof z.ZodLiteral) {
    return `literal(${JSON.stringify(inner._def.value)})`;
  }
  return 'value';
}

function renderToolSpec(spec: ToolSpec): string {
  return `### ${spec.name}
${spec.description}
Input fields:
${renderInputSchema(spec.inputSchema)}`;
}

function renderToolList(): string {
  return TOOL_SPECS.map(renderToolSpec).join('\n\n');
}

// Computed once at module load — fixed input, deterministic output.
const TOOL_LIST_BLOCK: string = renderToolList();

// CRM surface tool list — also computed once at module load for byte-stability.
const CRM_TOOL_LIST_BLOCK: string = toolSpecsForSurface('crm').map(renderToolSpec).join('\n\n');

/**
 * CRM-surface guidance injected into the dynamic suffix (not the cached prefix).
 * Tells the model: when to show cards, how to read the saved list, and what
 * My Apartments is vs. Explore.
 */
const CRM_SURFACE_BLOCK: string = `CRM surface — My Apartments (the user's saved-listing workspace):
- My Apartments is the single source of truth for this user's saved listings. Explore / the sublease marketplace is a SEPARATE surface for browsing other people's posts — never send the user there for their own list.
- Answer casual or status questions in prose. Mentioning a listing does NOT require a card.
- add_listing, first_save_analysis and rank_compare accept show_card. Set show_card: false unless a card genuinely helps: a save the user just made, a deep-dive analysis they asked for, or a ranking/comparison they explicitly requested.
- To read the saved list for a prose answer, call rank_compare with show_card: false.
- For the full list view, summarize briefly and point the user to their My Apartments page.`;

// ---------------------------------------------------------------------------
// Dynamic suffix builders
// ---------------------------------------------------------------------------

function renderStateBlock(state: ConversationState): string {
  const lines: string[] = ['Current conversation state:'];
  lines.push(`- mode: ${state.mode}`);
  lines.push(
    `- selectedListingId: ${state.selectedListingId ?? 'none'}`,
  );
  lines.push(
    `- comparedListingIds: ${
      state.comparedListingIds.length > 0
        ? state.comparedListingIds.join(', ')
        : 'none'
    }`,
  );

  const lastSearchArgs = state.lastSearch.args;
  const hasLastSearch = Object.keys(lastSearchArgs).length > 0;
  if (hasLastSearch) {
    lines.push(`- lastSearch.args: ${JSON.stringify(lastSearchArgs)}`);
    lines.push(
      `- lastSearch.resultListingIds: ${
        state.lastSearch.resultListingIds.length > 0
          ? state.lastSearch.resultListingIds.join(', ')
          : 'none'
      }`,
    );
  } else {
    lines.push('- lastSearch: none');
  }

  const pending = state.pendingAction;
  if (pending.kind === null) {
    lines.push('- pendingAction: none');
  } else {
    lines.push(`- pendingAction.kind: ${pending.kind}`);
    if (pending.payload) {
      lines.push(
        `- pendingAction.payload: ${JSON.stringify(pending.payload)}`,
      );
    }
  }

  return lines.join('\n');
}

function renderProfileBlock(profile: UserProfileSnippet): string {
  const lines: string[] = ['User profile:'];
  lines.push(`- displayName: ${profile.displayName ?? 'unknown'}`);
  lines.push(`- campusSlug: ${profile.campusSlug ?? 'unknown'}`);
  return lines.join('\n');
}

const GUEST_GUARDRAIL_BLOCK: string = `Guest session (no signed-in user):
- For this session you may use ONLY: search_listings, get_listing_detail, compare_listings, explain_lease_term.
- Do not call any other tool; the server will reject it.
- If the user wants any other action (schedule a tour, save a listing, contact a PM, post a sublease, run a mission, etc.), tell them to sign in first.`;

/**
 * Per codex amendment A1+A4: when a tour or sublease publish is pending,
 * the dynamic suffix carries an explicit HITL reminder. This is the third
 * line of defense — schema layer (typed `confirmed`) is first, handler gate
 * is second, this prompt reminder is third.
 */
function renderPendingActionHitlReminder(
  state: ConversationState,
): string | null {
  const kind = state.pendingAction.kind;
  if (kind === 'tour') {
    return `HITL REMINDER — pending tour request:
- The user has a tour preview waiting on the schedule_tour tool.
- You may call schedule_tour with confirmed=true ONLY if the user has explicitly confirmed in the LATEST turn (e.g. "yes", "book it", "go ahead").
- Otherwise, ask for the missing confirmation or correction in prose. Do not pass confirmed=true preemptively.
- The handler will refuse to dispatch the tour without confirmed=true; do not claim it is booked until the tool returns a confirmation block.`;
  }
  if (kind === 'sublease_publish') {
    return `HITL REMINDER — pending sublease publish:
- The user has a sublease preview waiting on the create_sublease tool.
- You may call create_sublease with confirmed=true ONLY if the user has explicitly confirmed publication in the LATEST turn.
- When confirming, you MUST re-send ALL sublease fields (address, bedrooms, etc.), not just confirmed=true.
- The handler will refuse to publish without confirmed=true; do not claim the listing is live until the tool returns a publish-confirmation block.`;
  }
  return null;
}

function buildDynamicSuffix(
  state: ConversationState,
  profile: UserProfileSnippet,
  options: BuildSystemPromptOptions,
): string {
  const sections: string[] = [];
  sections.push(renderStateBlock(state));
  sections.push(renderProfileBlock(profile));

  if (options.isGuest) {
    sections.push(GUEST_GUARDRAIL_BLOCK);
  }

  const hitlReminder = renderPendingActionHitlReminder(state);
  if (hitlReminder) {
    sections.push(hitlReminder);
  }

  if (options.surface === 'crm') {
    sections.push(CRM_SURFACE_BLOCK);
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Build the LLM-first system prompt as a split prefix/suffix. The prefix is
 * byte-identical across turns (cacheable); the suffix changes per turn.
 *
 * Pure and synchronous — fetch the profile beforehand via
 * `getUserProfileSnippet`.
 */
export function buildSystemPrompt(
  state: ConversationState,
  profile: UserProfileSnippet,
  options: BuildSystemPromptOptions = {},
): SystemPromptParts {
  const campusName = options.campusName ?? DEFAULT_CAMPUS_NAME;
  const toolList = options.surface === 'crm' ? CRM_TOOL_LIST_BLOCK : TOOL_LIST_BLOCK;
  const cachedPrefix = [
    buildPersona(campusName, options.surface),
    '',
    'Available tools (when_to_call hints + input shape):',
    toolList,
    '',
    buildPolicyBlock(options.surface),
  ].join('\n');

  const dynamicSuffix = buildDynamicSuffix(state, profile, options);

  return { cachedPrefix, dynamicSuffix };
}

/**
 * Concatenate the two segments into a single system prompt string. Useful
 * for code paths that don't (yet) use explicit caching.
 */
export function composeSystemPrompt(parts: SystemPromptParts): string {
  return `${parts.cachedPrefix}\n\n${parts.dynamicSuffix}`;
}

/**
 * Rough token estimate for logging / cache-size assertions. Uses the well
 * known 4-chars-per-token heuristic. Don't use this for billing — it's a
 * snapshot-test sanity check.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Profile snippet (from pre-fetched, authenticated data)
// ---------------------------------------------------------------------------

/** Fields the caller has already loaded for a user (or null for a guest). */
export interface UserProfileFields {
  /**
   * Authoritative app-managed display name from `profiles.display_name`.
   * Null for guests or when the column is empty.
   */
  readonly displayName?: string | null;
  /**
   * Campus the user is browsing. The route validates this against
   * `campus_configs` before the turn, so it's safe to thread through directly.
   */
  readonly campusSlug?: string | null;
}

/**
 * Build a compact profile snippet from already-authenticated, pre-fetched
 * fields. Returns the empty snippet for guests (no userId) so personalization
 * is silently skipped.
 *
 * FIX 2 (AIN-8 review): the previous version called `supabase.auth.getUser()`
 * with no token on the service-role client, which always returned null →
 * personalization was dead for signed-in users. The route already loads the
 * `profiles` row (for `subscription_tier`) and knows the validated `campusSlug`
 * from the request, so we accept those pre-fetched fields here — one DB
 * roundtrip, one code path, no extra auth call on the hot path.
 *
 * NOTE: this sources `displayName` from `profiles.display_name` (the
 * authoritative app-managed column) rather than `user_metadata.full_name`.
 * `campusSlug` comes from the request the user is actively browsing rather
 * than a stale metadata copy — a deliberate, documented divergence from the
 * original ticket text and a correctness improvement.
 */
export function getUserProfileSnippet(
  userId: string | null | undefined,
  fields: UserProfileFields = {},
): UserProfileSnippet {
  if (!userId) {
    return EMPTY_PROFILE_SNIPPET;
  }
  return {
    displayName: fields.displayName ?? null,
    campusSlug: fields.campusSlug ?? null,
  };
}
