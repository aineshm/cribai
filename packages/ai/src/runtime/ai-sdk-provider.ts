/**
 * PDR-004 Track A Days 3-4 — Vercel AI SDK model factory (AIN-8)
 *
 * Returns a Vercel AI SDK `LanguageModel` for the LLM-first turn handler,
 * mirroring the dual-backend selection in `gemini-client.ts` so both the
 * deterministic runtime (`@google/genai`) and the LLM-first runtime
 * (`ai` SDK) pick the SAME backend from the SAME environment:
 *
 *   - GEMINI_API_KEY set, and Vertex NOT forced → Google AI Studio
 *   - GOOGLE_CLOUD_PROJECT set                   → Vertex AI (ADC)
 *   - GOOGLE_GENAI_USE_VERTEXAI=true             → forces Vertex
 *
 * AI Studio is preferred when both are present UNLESS Vertex is forced —
 * identical precedence to `createGeminiClient`. The local dev + prod env
 * uses Vertex (`GOOGLE_GENAI_USE_VERTEXAI=true`).
 *
 * Vertex auth uses Application Default Credentials. On serverless (Vercel) the
 * key is supplied inline via `GOOGLE_APPLICATION_CREDENTIALS_JSON`; we
 * materialize it to a temp file by calling the SAME `ensureVertexCredentials`
 * helper the deterministic `createGeminiClient` uses — single source of truth.
 * Without this, a cold start where the deterministic client never ran would
 * fail Google auth before the AI SDK could stream (codex P1, AIN-8).
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { ensureVertexCredentials } from '../gemini-client';

/**
 * PR 2 — pluggable AI provider for the LLM-first runtime.
 *
 * `AI_PROVIDER` selects the backend family: `openai` (the new DEFAULT) or
 * `google` (the prior Gemini behavior, preserved byte-for-byte). `AI_MODEL_ID`
 * optionally overrides the per-provider default model id. The deterministic
 * `@google/genai` runtime (`cribai.ts`) is unaffected — it keeps pinning
 * `GEMINI_FLASH_MODEL_ID` directly.
 */
export type AiProvider = 'openai' | 'google';

/**
 * AIN-44 #5 — single source of truth for the Gemini Flash model id.
 *
 * Still pinned by the deterministic `@google/genai` runtime (`cribai.ts`) and
 * used as the `google`-provider default model id here. Kept exported as the
 * literal `'gemini-2.5-flash'` so the Google path and its importers never
 * break across the provider generalization.
 */
export const GEMINI_FLASH_MODEL_ID = 'gemini-2.5-flash';

/** Default model id when `AI_PROVIDER=openai` (verified PR 2). */
export const OPENAI_DEFAULT_MODEL_ID = 'gpt-5.4-mini';

/**
 * @deprecated Use `GEMINI_FLASH_MODEL_ID`. Retained as an alias so existing
 * importers (and the provider test) keep working through the rename.
 */
export const AI_SDK_MODEL_ID = GEMINI_FLASH_MODEL_ID;

/** Resolve the active provider from env. Defaults to `openai`. */
export function resolveAiProvider(
  env: NodeJS.ProcessEnv = process.env,
): AiProvider {
  // Trim + lowercase so `AI_PROVIDER='Google'`, `' google'`, or a stray trailing
  // newline don't silently fall through to openai (which would then surprise an
  // operator forcing the Google path with the OPENAI_API_KEY missing-key throw).
  // Mirrors the trim() already applied to the AI_MODEL_ID override below.
  return env.AI_PROVIDER?.trim().toLowerCase() === 'google' ? 'google' : 'openai';
}

/**
 * Resolve the active model id: `AI_MODEL_ID` override wins, else the
 * per-provider default. Read PER-CALL inside the factory so an env override is
 * honored at request time (and remains unit-testable without module reset).
 */
export function resolveModelId(
  provider: AiProvider,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.AI_MODEL_ID;
  if (typeof override === 'string' && override.trim().length > 0) {
    return override.trim();
  }
  return provider === 'openai' ? OPENAI_DEFAULT_MODEL_ID : GEMINI_FLASH_MODEL_ID;
}

/**
 * Provider-neutral ACTIVE model id, snapshotted at module load from env.
 *
 * Prod env is static across a serverless instance's lifetime, so a load-time
 * snapshot is correct for the two load-time consumers that need it:
 *   - `turn-cost.ts` — the "fail loud if unpriced" guard + the PRICING key.
 *   - `llm-turn.ts`  — the Langfuse `model:` telemetry tag.
 * The FACTORY itself resolves the id per-call (see `createAiSdkModel`) so an
 * `AI_MODEL_ID` override is honored at request time.
 */
export const ACTIVE_MODEL_ID = resolveModelId(resolveAiProvider());

export interface CreateAiSdkModelOptions {
  /** Override the AI Studio / OpenAI API key (mirrors `createGeminiClient`). */
  readonly apiKey?: string;
}

/**
 * Build a Vercel AI SDK language model. `AI_PROVIDER=openai` (default) uses the
 * OpenAI provider; `AI_PROVIDER=google` preserves the prior Gemini backend
 * selection (AI Studio / Vertex) with the same precedence as
 * `createGeminiClient`.
 */
export function createAiSdkModel(
  options: CreateAiSdkModelOptions = {},
): LanguageModel {
  const provider = resolveAiProvider();
  const modelId = resolveModelId(provider);

  if (provider === 'openai') {
    return createOpenAiModel(modelId, options.apiKey);
  }

  return createGoogleModel(modelId, options.apiKey);
}

/** OpenAI backend. Requires `OPENAI_API_KEY` (or an explicit override). */
function createOpenAiModel(modelId: string, apiKeyOverride?: string): LanguageModel {
  const apiKey = apiKeyOverride ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'AI SDK model not configured. AI_PROVIDER=openai requires OPENAI_API_KEY ' +
        '(or set AI_PROVIDER=google for Gemini).',
    );
  }
  const openai = createOpenAI({ apiKey });
  return openai(modelId);
}

/** Google backend — AI Studio / Vertex selection, preserved byte-for-byte. */
function createGoogleModel(modelId: string, apiKeyOverride?: string): LanguageModel {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const apiKey = apiKeyOverride ?? process.env.GEMINI_API_KEY;
  const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';

  // Prefer the API key when present — a stray GOOGLE_CLOUD_PROJECT without
  // credentials should not force local/dev deployments onto Vertex AI.
  if (apiKey && !useVertex) {
    const googleProvider = createGoogleGenerativeAI({ apiKey });
    return googleProvider(modelId);
  }

  if (project) {
    // Materialize inline service-account JSON (serverless) the same way the
    // deterministic client does, before the Vertex provider's ADC lookup runs.
    ensureVertexCredentials();
    const vertexProvider = createVertex({ project, location });
    return vertexProvider(modelId);
  }

  if (!apiKey) {
    throw new Error(
      'AI SDK model not configured. Set GOOGLE_CLOUD_PROJECT for Vertex AI, or GEMINI_API_KEY for AI Studio.',
    );
  }

  const googleProvider = createGoogleGenerativeAI({ apiKey });
  return googleProvider(modelId);
}
