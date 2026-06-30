/**
 * PDR-004 Track A Days 5-6 (AIN-9) — Langfuse observability bootstrap.
 *
 * Langfuse v5.4 is OpenTelemetry-based: a `LangfuseSpanProcessor` (from
 * `@langfuse/otel`) is registered on an OTel `TracerProvider`, and the Vercel
 * AI SDK emits GenAI spans into it via `streamText({ experimental_telemetry })`.
 *
 * (Note: an earlier comment incorrectly called this "v4" — the installed dep
 * is `@langfuse/*@^5.4` and the API surface here matches that version.)
 *
 * NO-OP CONTRACT (mirrors `metrics.ts` "no client = no-op"):
 *   - When `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` are absent, `initLangfuse`
 *     installs nothing and `isLangfuseConfigured()` is false. The route gates
 *     `experimental_telemetry.isEnabled` on this, so dev / test / dark-flag-off
 *     never touch the network and never break.
 *   - `flushLangfuse()` always returns a resolved Promise — so the route's
 *     `Promise.all([persist, metrics, flush])` keeps the same shape whether or
 *     not Langfuse is configured.
 *
 * `ai_request_metrics` (AIN-19) and Langfuse COEXIST: the SQL table powers
 * p50/p95/p99 latency rollups; Langfuse holds rich per-turn traces, token
 * cost, and the eval harness. Same turn, two stores, no replacement.
 *
 * The bootstrap is idempotent + module-scoped: `initLangfuse` is safe to call
 * on every request (it installs the processor exactly once per process).
 */

import {
  LangfuseSpanProcessor,
  type LangfuseSpanProcessorParams,
} from '@langfuse/otel';
import {
  startObservation,
  updateActiveObservation,
  type LangfuseSpan,
} from '@langfuse/tracing';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

/** Env keys Langfuse reads. `LANGFUSE_BASE_URL` is optional (SDK default). */
export interface LangfuseEnv {
  readonly LANGFUSE_PUBLIC_KEY?: string;
  readonly LANGFUSE_SECRET_KEY?: string;
  readonly LANGFUSE_BASE_URL?: string;
}

/**
 * Minimal contract a span processor must satisfy for our purposes — lets unit
 * tests inject a fake instead of constructing a real `LangfuseSpanProcessor`.
 */
export interface FlushableSpanProcessor {
  forceFlush: () => Promise<void>;
  shutdown?: () => Promise<void>;
}

/** Pluggable factory so tests can inject a fake processor (no network). */
export type SpanProcessorFactory = (
  params: LangfuseSpanProcessorParams,
) => FlushableSpanProcessor;

/** Pluggable provider registration so tests don't install a global provider. */
export type ProviderRegistrar = (processor: FlushableSpanProcessor) => void;

export interface InitLangfuseOptions {
  /** Defaults to `process.env`. Inject for tests. */
  readonly env?: LangfuseEnv;
  /** Defaults to the real `LangfuseSpanProcessor` constructor. */
  readonly processorFactory?: SpanProcessorFactory;
  /** Defaults to registering a `NodeTracerProvider`. */
  readonly registerProvider?: ProviderRegistrar;
}

// Module-scoped singletons — installed at most once per process.
let installedProcessor: FlushableSpanProcessor | null = null;
let initialized = false;

/**
 * True when both Langfuse keys are present in the given env (defaults to
 * `process.env`). The route gates telemetry on this so an unconfigured
 * environment is a clean no-op.
 */
export function isLangfuseConfigured(env: LangfuseEnv = process.env): boolean {
  return (
    typeof env.LANGFUSE_PUBLIC_KEY === 'string' &&
    env.LANGFUSE_PUBLIC_KEY.length > 0 &&
    typeof env.LANGFUSE_SECRET_KEY === 'string' &&
    env.LANGFUSE_SECRET_KEY.length > 0
  );
}

/** Default provider registration: install a NodeTracerProvider globally. */
const defaultRegisterProvider: ProviderRegistrar = (processor) => {
  const provider = new NodeTracerProvider({
    spanProcessors: [processor as never],
  });
  provider.register();
};

/**
 * Idempotently initialize Langfuse tracing. Returns the installed processor,
 * or `null` when Langfuse is not configured (no keys) — in which case nothing
 * is installed and tracing is a no-op.
 *
 * Safe to call on every request: only the FIRST call with valid keys installs
 * the processor; later calls return the existing one.
 */
export function initLangfuse(
  options: InitLangfuseOptions = {},
): FlushableSpanProcessor | null {
  const env = options.env ?? process.env;

  if (initialized) {
    return installedProcessor;
  }

  if (!isLangfuseConfigured(env)) {
    // No keys → no-op. Mark initialized so we don't re-check every request.
    initialized = true;
    installedProcessor = null;
    return null;
  }

  const factory =
    options.processorFactory ??
    ((params) => new LangfuseSpanProcessor(params) as FlushableSpanProcessor);
  const register = options.registerProvider ?? defaultRegisterProvider;

  const processor = factory({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    // Coerce an empty string (e.g. an unset GitHub Actions `${{ secrets.X }}`
    // expands to "") to undefined so the SDK falls back to its default endpoint
    // instead of constructing `new URL("")` and throwing during init.
    baseUrl: env.LANGFUSE_BASE_URL || undefined,
  });
  register(processor);

  installedProcessor = processor;
  initialized = true;
  return processor;
}

/**
 * Flush any buffered Langfuse spans. ALWAYS resolves — a no-op (resolved
 * Promise) when Langfuse is not configured, so callers can `Promise.all` it
 * unconditionally. Swallows flush errors (observability must never break the
 * response) but logs them.
 */
export async function flushLangfuse(): Promise<void> {
  if (!installedProcessor) return;
  try {
    await installedProcessor.forceFlush();
  } catch (err) {
    console.error('[langfuse] forceFlush failed:', err);
  }
}

/**
 * Tag a Langfuse observation as `cost_cap_exceeded` — level WARNING +
 * statusMessage + metadata. This is the Langfuse-side signal PDR-004 §Risks A6
 * alerting keys on (console logs don't reach Langfuse).
 *
 * AIN-9 review FIX 1 — when given an OWNED span handle (the `cribai.llm_turn`
 * span `startLlmTurnObservation` opens), we update THAT span directly via
 * `span.update(...)`. Direct update doesn't need an active OTel context, so the
 * generator's yield points can't interleave the span out of scope.
 *
 * Falling back to `updateActiveObservation` (when no span is passed) is kept
 * for compatibility, but ONLY works while an OTel context is active for the
 * intended span — the original AIN-9 implementation hit this trap because the
 * AI SDK's GenAI span had already ended by the post-`await result.totalUsage`
 * call site. Pass a span handle to make the tag deterministic.
 *
 * Always a no-op + never throws when Langfuse is not installed (or a span
 * handle wasn't supplied and no active context exists), so the cost-cap path
 * stays safe in dev / dark-flag-off / tests. When a span handle IS supplied
 * the tag is delivered even when `installedProcessor` is unset (used in unit
 * tests that wire an isolated tracer provider via `setLangfuseTracerProvider`).
 */
export function tagCostCapExceeded(
  metadata: Record<string, unknown>,
  span?: LangfuseSpan | null,
): void {
  const attributes = {
    level: 'WARNING' as const,
    statusMessage: 'cost_cap_exceeded',
    metadata: { event: 'cost_cap_exceeded', ...metadata },
  };
  // Preferred path: tag the owned span directly — no active-context dependency.
  if (span) {
    try {
      span.update(attributes);
    } catch (err) {
      console.error('[langfuse] tagCostCapExceeded (span.update) failed:', err);
    }
    return;
  }
  // Legacy path retained for compatibility; only useful when an OTel active
  // context is genuinely live for the target span at the call site.
  if (!installedProcessor) return;
  try {
    updateActiveObservation(attributes);
  } catch (err) {
    console.error('[langfuse] tagCostCapExceeded (updateActiveObservation) failed:', err);
  }
}

/**
 * AIN-9 review FIX 1 — start an OWNED Langfuse span for one LLM-first turn.
 *
 * The AI SDK's `streamText` opens its own GenAI span, but that span is only
 * active inside the SDK's synchronous callback stack — by the time `runLlmTurn`
 * awaits `result.totalUsage` and projects the turn cost, that span has ended.
 * To make `cost_cap_exceeded` land on a real span we open one we control,
 * spanning the streamText call + drain + cost projection + tag, and end it
 * just before yielding `done`. The handle is also passed into
 * `tagCostCapExceeded` so the tag is delivered via direct `span.update`,
 * independent of any active OTel context.
 *
 * Returns null when Langfuse is not configured (no keys → no install), so the
 * caller can `if (handle) handle.end()` without a feature-flag.
 *
 * Pluggable factory so tests can inject `startObservation` directly bound to
 * an isolated tracer provider; defaults to the real `@langfuse/tracing` export.
 */
export type StartTurnSpan = (name: string) => LangfuseSpan;

export function startLlmTurnObservation(
  name: string = 'cribai.llm_turn',
  options: { readonly start?: StartTurnSpan } = {},
): LangfuseSpan | null {
  // Hide a misuse (no install + no test seam) behind a null so the caller is
  // a single branch. Real tests inject `setLangfuseTracerProvider` so
  // `startObservation` still returns a real handle even when
  // `installedProcessor` is null.
  const start = options.start ?? startObservation;
  try {
    return start(name);
  } catch (err) {
    console.error('[langfuse] startLlmTurnObservation failed:', err);
    return null;
  }
}

/**
 * Test-only: reset the module-scoped singletons so each test starts clean.
 * Not part of the runtime API.
 */
export function __resetLangfuseForTests(): void {
  installedProcessor = null;
  initialized = false;
}
