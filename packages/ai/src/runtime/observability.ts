/**
 * PDR-004 Track A Days 5-6 (AIN-9) — Langfuse observability bootstrap.
 *
 * Langfuse v4 is OpenTelemetry-based: a `LangfuseSpanProcessor` (from
 * `@langfuse/otel`) is registered on an OTel `TracerProvider`, and the Vercel
 * AI SDK emits GenAI spans into it via `streamText({ experimental_telemetry })`.
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
    baseUrl: env.LANGFUSE_BASE_URL,
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
 * Test-only: reset the module-scoped singletons so each test starts clean.
 * Not part of the runtime API.
 */
export function __resetLangfuseForTests(): void {
  installedProcessor = null;
  initialized = false;
}
