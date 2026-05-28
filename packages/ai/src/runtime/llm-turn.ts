/**
 * PDR-004 Track A Days 3-4 — LLM-first turn handler (AIN-8)
 *
 * `runLlmTurn` drives one conversational turn through the Vercel AI SDK
 * (`streamText`) and emits the SAME `ChatEvent` union the deterministic
 * runtime already produces (see `cribai.ts`). The route's existing
 * stream-consume / metrics-marking / persistence loop is therefore reused
 * verbatim — the route stays a thin adapter.
 *
 * Closes the two PDR-004 codex P1 findings:
 *   - PR #74: the system prompt is composed PREFIX-FIRST. When an explicit
 *     Gemini context cache holds the prefix, the `system` content is the
 *     `dynamicSuffix` only and the prefix is referenced via `providerOptions`;
 *     otherwise the prefix is composed inline (`composeSystemPrompt`).
 *   - PR #69: tools are built via `buildToolRegistry(ctx, sink)` so each
 *     tool's `execute` returns ONLY the string `modelContext` to the model.
 *     The full `ToolResult` (clientBlock / statePatch / machineData / mapBlock
 *     / missionRequest) is routed out-of-band to this loop via the sink.
 *
 * A10 ordering contract (load-bearing):
 *   Assistant prose that references tool results must NEVER reach the client
 *   before those results. We BUFFER `text-delta` per step and flush the
 *   buffer only at the step boundary (`finish-step`) — by which point the
 *   SDK has already emitted that step's `tool-call` and `tool-result` parts.
 *   `tool_call` / `tool_result` ChatEvents are emitted immediately as their
 *   stream parts arrive, so the wire order is always:
 *     tool_call → tool_result → (next step) text → done
 *
 * The sink stashes each `ToolResult` keyed by `toolCallId`; when the SDK's
 * `tool-result` part arrives (carrying the same `toolCallId`) we look up the
 * stashed result and emit the rich `tool_result` ChatEvent. A thrown handler
 * (guest-disallowed / unknown / failure) surfaces as a `tool-error` part,
 * which we render as an error text block — mirroring `cribai.ts`.
 */

import {
  streamText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
} from 'ai';
import type { ChatBlock, ConversationState } from '@campusnest/types';
import {
  buildSystemPrompt,
  composeSystemPrompt,
  type UserProfileSnippet,
} from './system-prompt';
import {
  buildToolRegistry,
  type ToolCallBudget,
  type ToolResultSink,
} from './tool-registry';
import type { ToolContext, ToolName, ToolResult } from '../tools/types';
import type { ChatEvent } from '../cribai';
import {
  ExplicitCacheMemo,
  type ExplicitCacheCreator,
} from './prompt-cache';
import {
  isLangfuseConfigured,
  startLlmTurnObservation,
  tagCostCapExceeded,
} from './observability';
import {
  projectTurnCost,
  isOverCap,
  resolveTurnCostCapUsd,
  type TurnCost,
  type TurnUsage,
} from './turn-cost';
import { GEMINI_FLASH_MODEL_ID } from './ai-sdk-provider';
import { sanitizeCampusName } from './persona';

/** Step budget mirrors `cribai.ts` maxToolCalls: 5 auth / 2 guest. */
const AUTH_MAX_STEPS = 5;
const GUEST_MAX_STEPS = 2;

export interface RunLlmTurnInput {
  /** Vercel AI SDK model. Inject for tests; prod uses `createAiSdkModel()`. */
  readonly model: LanguageModel;
  readonly query: string;
  readonly state: ConversationState;
  readonly profile: UserProfileSnippet;
  readonly toolContext: ToolContext;
  readonly campusName: string;
  readonly isGuest: boolean;
  readonly history?: ReadonlyArray<{ readonly role: 'user' | 'model'; readonly content: string }>;
  /**
   * Enable explicit Gemini context caching of the invariant prefix. Off in
   * unit tests (no live network). A cache outage degrades to prefix-first
   * composition — chat never breaks. Defaults to false.
   */
  readonly explicitCache?: boolean;
  /**
   * Pluggable cache creator (deferred real `caches.create` smoke). Required
   * only when `explicitCache` is true.
   */
  readonly cacheCreator?: ExplicitCacheCreator;
  /** Shared in-process cache memo (injected so the route can keep it warm). */
  readonly cacheMemo?: ExplicitCacheMemo;
  /**
   * FIX 3 (AIN-8 review) — fired exactly once, the moment the FIRST model
   * output part arrives (first `text-delta` OR first `tool-call`, whichever
   * comes first). The route wires this to `metricsRecorder.markFirstModelToken()`
   * so the AIN-19 TTFT metric is stamped at first token rather than at the
   * step-boundary text flush — keeping the cross-runtime TTFT comparison fair
   * on prose-only turns. Independent of A10 prose buffering: the buffered
   * `text` event still flushes at the step boundary; only the metric marker
   * moves earlier.
   */
  readonly onFirstModelToken?: () => void;
  /**
   * AIN-9 (Days 5-6) — fired exactly once, AFTER the stream fully drains and
   * BEFORE the terminal `done` event, with the projected USD cost of the turn
   * (from `result.totalUsage`, reusing the cost-logger pricing). The route
   * wires this to its Langfuse/metrics bookkeeping. Cost is best-effort: if
   * usage never resolves it is NOT fired. Independent of the AIN-19
   * `ai_request_metrics` latency recorder — Langfuse holds the rich cost trace.
   */
  readonly onTurnCost?: (cost: TurnCost) => void;
  /**
   * Per-turn cost cap (USD). Defaults to `resolveTurnCostCapUsd()` (env
   * CRIBAI_TURN_COST_CAP_USD, fallback $0.05). When the projected cost exceeds
   * the cap, the handler logs a structured warning and tags the active
   * Langfuse trace `cost_cap_exceeded` — it does NOT throw (the turn has
   * already streamed to the user).
   */
  readonly turnCostCapUsd?: number;
  /**
   * Test seam: override whether Langfuse telemetry is wired into `streamText`.
   * Defaults to `isLangfuseConfigured()` so prod gates on env keys and unit
   * tests stay offline. Injecting `false` keeps the SDK from emitting spans.
   */
  readonly telemetryEnabled?: boolean;
}

/** Map the deterministic conversation history into AI SDK ModelMessages. */
function toModelMessages(
  history: ReadonlyArray<{ readonly role: 'user' | 'model'; readonly content: string }>,
  query: string,
): ModelMessage[] {
  const messages: ModelMessage[] = history
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === 'model' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }));
  messages.push({ role: 'user', content: query });
  return messages;
}

/** Build the error block emitted when a tool handler throws. Mirrors cribai.ts. */
function toolErrorBlock(message: string): ChatBlock {
  return { type: 'text', content: `Error: ${message}` } as ChatBlock;
}

/**
 * Normalize the AI SDK's resolved `LanguageModelUsage` into the flat
 * `TurnUsage` the cost projector expects. `inputTokens` is the TOTAL prompt
 * tokens (includes cached); cached tokens come from `inputTokenDetails.
 * cacheReadTokens` (preferred) or the deprecated `cachedInputTokens`, with the
 * Google provider's `usageMetadata.cachedContentTokenCount` as a final
 * fallback. Tolerates `undefined` fields → 0.
 */
function normalizeUsage(
  usage: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly cachedInputTokens?: number;
    readonly inputTokenDetails?: { readonly cacheReadTokens?: number };
  } | undefined,
  providerMetadata: Record<string, unknown> | undefined,
): TurnUsage {
  const google = (providerMetadata?.google ?? {}) as {
    usageMetadata?: { cachedContentTokenCount?: number | null };
  };
  const cachedFromProvider = google.usageMetadata?.cachedContentTokenCount ?? 0;
  const cachedTokens =
    usage?.inputTokenDetails?.cacheReadTokens ??
    usage?.cachedInputTokens ??
    cachedFromProvider ??
    0;
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cachedTokens: cachedTokens ?? 0,
  };
}

/**
 * Drive one LLM-first turn. Yields `ChatEvent`s in the A10-safe order. On a
 * provider/stream error, RETHROWS so the route's existing errorKind
 * classifier (quota / RESOURCE_EXHAUSTED / 429 → gemini_quota) still fires.
 */
export async function* runLlmTurn(
  input: RunLlmTurnInput,
): AsyncGenerator<ChatEvent> {
  const {
    model,
    query,
    state,
    profile,
    toolContext,
    campusName,
    isGuest,
    history = [],
    explicitCache = false,
    cacheCreator,
    onFirstModelToken,
    onTurnCost,
    turnCostCapUsd,
    telemetryEnabled,
  } = input;

  // AIN-9 — wire Langfuse telemetry into `streamText` only when configured.
  // Gated so dev/test/dark-flag-off never emit spans or touch the network.
  const langfuseOn = telemetryEnabled ?? isLangfuseConfigured();

  // AIN-9 review FIX 1 — open an OWNED Langfuse span for this turn so the
  // post-stream `cost_cap_exceeded` tag has a real span to land on. The AI
  // SDK's own GenAI span is only active inside its synchronous callback stack
  // and has already ended by the time we project cost (after
  // `await result.totalUsage`). Owning the parent span makes the tag
  // deterministic: we call `tagCostCapExceeded(metadata, turnSpan)` which
  // updates this handle directly via `span.update(...)` — no active-context
  // dependency. `null` when Langfuse is off → a clean no-op everywhere below.
  const turnSpan = langfuseOn ? startLlmTurnObservation('cribai.llm_turn') : null;

  // FIX 3 — fire onFirstModelToken once, on the first model output part.
  let firstModelTokenFired = false;
  const signalFirstModelToken = (): void => {
    if (firstModelTokenFired) return;
    firstModelTokenFired = true;
    onFirstModelToken?.();
  };

  const { cachedPrefix, dynamicSuffix } = buildSystemPrompt(state, profile, {
    campusName,
    isGuest,
  });

  // Resolve explicit cache (or null → compose prefix inline). A null handle
  // — whether from the disabled switch or a cache outage — falls back to a
  // composed prompt so chat is never taken down by a cache failure.
  const memo = input.cacheMemo ?? new ExplicitCacheMemo();
  const cacheHandle =
    explicitCache && cacheCreator
      ? await memo.resolve(cachedPrefix, true, cacheCreator)
      : null;

  // PR #74 prefix-first: with an explicit cache the system content is the
  // dynamic suffix only (prefix lives in the cache, referenced via
  // providerOptions); without it the prefix is composed inline, prefix first.
  const system = cacheHandle
    ? dynamicSuffix
    : composeSystemPrompt({ cachedPrefix, dynamicSuffix });

  const providerOptions = cacheHandle
    ? { google: { cachedContent: cacheHandle.name } }
    : undefined;

  // Out-of-band sink: stash the full ToolResult keyed by the SDK's
  // `toolCallId` so the loop correlates EXACTLY with the matching
  // `tool-result` stream part (same id). The sink fires synchronously inside
  // `execute`, BEFORE the SDK emits that call's tool-result, so the entry is
  // always present when we look it up. Keying by id is robust even if the SDK
  // runs parallel calls to the same tool and they complete out of order.
  const resultsByCallId = new Map<string, ToolResult>();
  const sink: ToolResultSink = (toolCallId, _toolName, result) => {
    resultsByCallId.set(toolCallId, result);
  };

  // codex P2: `stepCountIs` only caps model round-trips. The SDK runs ALL
  // tool-call `execute` closures within a single step before re-evaluating the
  // stop condition, so a step that emits N parallel tool calls would run all N
  // — bypassing the legacy per-turn cap (5 auth / 2 guest) and letting
  // `propose_mission` spam mission rows. This mutable budget is threaded into
  // the registry's `execute` wrapper, which atomically caps tool EXECUTIONS at
  // the same limit, covering the parallel-calls-in-one-step case. The
  // `stepCountIs` stop condition is kept too: it still bounds round-trips
  // (and matters for prose-only / single-call-per-step turns).
  const toolCallBudget: ToolCallBudget = {
    limit: isGuest ? GUEST_MAX_STEPS : AUTH_MAX_STEPS,
    count: 0,
  };

  const tools = buildToolRegistry(toolContext, sink, toolCallBudget);

  const result = streamText({
    model,
    system,
    messages: toModelMessages(history, query),
    tools,
    stopWhen: stepCountIs(isGuest ? GUEST_MAX_STEPS : AUTH_MAX_STEPS),
    ...(providerOptions ? { providerOptions } : {}),
    // AIN-9 — Langfuse picks up the GenAI span the AI SDK emits here. We do
    // NOT record raw inputs/outputs (PII / data-transfer), only the metadata
    // tags. Disabled entirely when Langfuse is not configured.
    experimental_telemetry: {
      isEnabled: langfuseOn,
      functionId: 'cribai.llm_turn',
      recordInputs: false,
      recordOutputs: false,
      metadata: {
        runtime: 'llm_first',
        isGuest,
        // AIN-24 — sanitize the campus name at the telemetry boundary too
        // (it's the same trust boundary `buildPersona` sanitizes; defense in
        // depth in case a trace is ever shared externally).
        campusName: sanitizeCampusName(campusName),
        model: GEMINI_FLASH_MODEL_ID,
      },
    },
  });

  // Per-step text buffer. Flushed only at the step boundary, after that
  // step's tool_call/tool_result events (A10).
  let stepText = '';

  // AIN-9 review FIX 1 — outer try/finally so the owned turn span is ALWAYS
  // ended (clean drain, mid-stream throw, OR cost-projection skip). The inner
  // try/catch around the stream is preserved verbatim so the route's quota /
  // RESOURCE_EXHAUSTED / 429 classifier still fires on a provider error.
  try {
   try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          // FIX 3: mark first model token at the first delta, even though the
          // buffered text event is not flushed until the step boundary (A10).
          signalFirstModelToken();
          stepText += part.text;
          break;
        }
        case 'tool-call': {
          signalFirstModelToken();
          yield {
            type: 'tool_call',
            name: part.toolName,
            args: (part.input ?? {}) as Record<string, unknown>,
          };
          break;
        }
        case 'tool-result': {
          const toolName = part.toolName as ToolName;
          const full = resultsByCallId.get(part.toolCallId);
          if (full) {
            resultsByCallId.delete(part.toolCallId);
            yield {
              type: 'tool_result',
              name: toolName,
              block: full.clientBlock,
              machineData: full.machineData,
              statePatch: full.statePatch,
            };
            if (full.mapBlock) {
              yield {
                type: 'tool_result',
                name: `${toolName}_map`,
                block: full.mapBlock,
                machineData: full.machineData,
                statePatch: full.statePatch,
              };
            }
            if (full.missionRequest) {
              yield {
                type: 'mission_request',
                missionType: full.missionRequest.type,
                input: full.missionRequest.input,
              };
            }
          }
          break;
        }
        case 'tool-error': {
          const message =
            part.error instanceof Error
              ? part.error.message
              : typeof part.error === 'string'
                ? part.error
                : 'Tool execution failed';
          yield {
            type: 'tool_result',
            name: part.toolName,
            block: toolErrorBlock(message),
          };
          break;
        }
        case 'finish-step': {
          // A10: the SDK has already emitted this step's tool-call/tool-result
          // parts above, so flushing now is safe and ordered.
          if (stepText.length > 0) {
            yield { type: 'text', content: stepText };
            stepText = '';
          }
          break;
        }
        case 'error': {
          // Surface mid-stream provider errors as a throw so the route's
          // existing quota classifier fires.
          throw part.error instanceof Error
            ? part.error
            : new Error(String(part.error));
        }
        default:
          // start / start-step / finish / text-start / text-end / etc. — no-op.
          break;
      }
    }

    // Flush any trailing buffered text (no-tool turn ends without a
    // finish-step flush only if the model never closed a step; defensive).
    if (stepText.length > 0) {
      yield { type: 'text', content: stepText };
      stepText = '';
    }
   } catch (err) {
    // Rethrow so the route catch maps quota / RESOURCE_EXHAUSTED / 429.
    throw err instanceof Error ? err : new Error(String(err));
   }

   // AIN-9 — project the turn cost AFTER the stream drains (usage is resolved
   // by now) and BEFORE `done`, so the route's post-stream bookkeeping
   // (Promise.all([persist, metrics, flushLangfuse])) sees the cost already
   // computed. Best-effort + never throws: a cost failure must not break a
   // turn that already streamed successfully.
   if (onTurnCost) {
    try {
      const [usage, providerMetadata] = await Promise.all([
        result.totalUsage,
        result.providerMetadata,
      ]);
      const turnUsage = normalizeUsage(usage, providerMetadata);
      const cost = projectTurnCost(turnUsage);
      const capUsd = turnCostCapUsd ?? resolveTurnCostCapUsd();
      if (isOverCap(cost.costUsd, capUsd)) {
        // Structured warning + Langfuse trace tag. Do NOT throw — the turn
        // already streamed. The route's separate output-token / tool-step
        // alerts (PDR-004 A6) cover the runaway-output case.
        const capMeta = {
          costUsd: cost.costUsd,
          capUsd,
          inputTokens: cost.inputTokens,
          outputTokens: cost.outputTokens,
          cachedTokens: cost.cachedTokens,
        };
        console.warn('[cribai] cost_cap_exceeded', JSON.stringify(capMeta));
        // AIN-9 review FIX 1 — pass the OWNED turn span so the tag lands via
        // direct `span.update(...)` instead of `updateActiveObservation` (the
        // GenAI span the SDK opened is already closed by this point). No-op
        // when Langfuse is off / span unset.
        if (langfuseOn) {
          tagCostCapExceeded(capMeta, turnSpan);
        }
      }
      onTurnCost(cost);
    } catch (costErr) {
      console.error('[cribai] turn-cost projection failed:', costErr);
    }
   }

   yield { type: 'done' };
  } finally {
    // FIX 1 — end the owned span exactly once (after `done` was yielded or a
    // rethrown stream error). `end()` is a no-op when `turnSpan` is null.
    try {
      turnSpan?.end();
    } catch (endErr) {
      console.error('[langfuse] turnSpan.end failed:', endErr);
    }
  }
}
