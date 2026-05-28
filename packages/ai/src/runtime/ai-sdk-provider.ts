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
import type { LanguageModel } from 'ai';
import { ensureVertexCredentials } from '../gemini-client';

/**
 * AIN-44 #5 — single source of truth for the Gemini Flash model id.
 *
 * Both runtimes pin the same model: the LLM-first AI SDK provider (here) and
 * the deterministic `@google/genai` runtime (`cribai.ts`). Previously the
 * string `'gemini-2.5-flash'` was duplicated across `cribai.ts` (model arg +
 * cost-logger arg) and this provider — a model bump had to be made in three
 * places. This constant centralizes it.
 */
export const GEMINI_FLASH_MODEL_ID = 'gemini-2.5-flash';

/**
 * @deprecated Use `GEMINI_FLASH_MODEL_ID`. Retained as an alias so existing
 * importers (and the provider test) keep working through the rename.
 */
export const AI_SDK_MODEL_ID = GEMINI_FLASH_MODEL_ID;

export interface CreateAiSdkModelOptions {
  /** Override the AI Studio API key (mirrors `createGeminiClient`). */
  readonly apiKey?: string;
}

/**
 * Build a Vercel AI SDK language model selecting the backend from env, with
 * the same precedence as `createGeminiClient`.
 */
export function createAiSdkModel(
  options: CreateAiSdkModelOptions = {},
): LanguageModel {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';

  // Prefer the API key when present — a stray GOOGLE_CLOUD_PROJECT without
  // credentials should not force local/dev deployments onto Vertex AI.
  if (apiKey && !useVertex) {
    const provider = createGoogleGenerativeAI({ apiKey });
    return provider(GEMINI_FLASH_MODEL_ID);
  }

  if (project) {
    // Materialize inline service-account JSON (serverless) the same way the
    // deterministic client does, before the Vertex provider's ADC lookup runs.
    ensureVertexCredentials();
    const provider = createVertex({ project, location });
    return provider(GEMINI_FLASH_MODEL_ID);
  }

  if (!apiKey) {
    throw new Error(
      'AI SDK model not configured. Set GOOGLE_CLOUD_PROJECT for Vertex AI, or GEMINI_API_KEY for AI Studio.',
    );
  }

  const provider = createGoogleGenerativeAI({ apiKey });
  return provider(GEMINI_FLASH_MODEL_ID);
}
