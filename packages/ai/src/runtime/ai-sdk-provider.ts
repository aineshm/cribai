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
 * Vertex auth uses Application Default Credentials (or the inline JSON the
 * deterministic client materializes via `ensureVertexCredentials`); the AI
 * SDK's Vertex provider reads ADC the same way, so no extra wiring is needed
 * here beyond project + location.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import type { LanguageModel } from 'ai';

/** Model id used across both backends. Keep in lock-step with cribai.ts. */
export const AI_SDK_MODEL_ID = 'gemini-2.5-flash';

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
    return provider(AI_SDK_MODEL_ID);
  }

  if (project) {
    const provider = createVertex({ project, location });
    return provider(AI_SDK_MODEL_ID);
  }

  if (!apiKey) {
    throw new Error(
      'AI SDK model not configured. Set GOOGLE_CLOUD_PROJECT for Vertex AI, or GEMINI_API_KEY for AI Studio.',
    );
  }

  const provider = createGoogleGenerativeAI({ apiKey });
  return provider(AI_SDK_MODEL_ID);
}
