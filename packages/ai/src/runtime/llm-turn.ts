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
  } = input;

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
  });

  // Per-step text buffer. Flushed only at the step boundary, after that
  // step's tool_call/tool_result events (A10).
  let stepText = '';

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

  yield { type: 'done' };
}
