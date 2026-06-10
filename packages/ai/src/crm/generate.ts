/**
 * CRM structured-generation seam (AIN-15, Track C "#3").
 *
 * The two CRM workflows that make LLM calls — `inferProfile` and
 * `firstSaveAnalysis`'s red-flag branch — previously called the `@google/genai`
 * client directly (`ai.models.generateContent({ responseMimeType:'application/json' })`)
 * plus a manual `JSON.parse` + Zod `safeParse`. This module replaces that with a
 * single injectable wrapper over the Vercel AI SDK's `generateObject`, so:
 *
 *   - The CRM runs on the SAME provider as the LLM-first runtime
 *     (OpenAI `gpt-5.4-mini` by default; see `runtime/ai-sdk-provider.ts`),
 *     instead of hardcoding `gemini-2.5-flash`.
 *   - `generateObject` validates against the Zod schema and THROWS
 *     `NoObjectGeneratedError` on parse/validation failure — so the workflows'
 *     existing try/catch degradation paths catch the throw and the manual
 *     `JSON.parse`/`safeParse` is removed.
 *   - Langfuse telemetry is emitted for these inner calls via
 *     `experimental_telemetry`, gated on `isLangfuseConfigured()`.
 *
 * DI seam: `CrmGenerateObject` is a narrow function type the workflows inject as
 * `deps.generate?`. The default (`defaultCrmGenerate`) constructs the shared
 * factory model LAZILY — `createAiSdkModel()` runs INSIDE the call, not at
 * module/default-param time — so a missing `OPENAI_API_KEY` throws THROUGH the
 * caller's try/catch and degrades gracefully, exactly like the old
 * `createGeminiClient()`-inside-try contract. Tests inject a fake `generate`
 * (a `vi.fn()`), so they never touch a real provider.
 */

import { generateObject } from 'ai';
import type { LanguageModel, TelemetrySettings } from 'ai';
import type { z } from 'zod';
import { createAiSdkModel } from '../runtime/ai-sdk-provider';
import { isLangfuseConfigured } from '../runtime/observability';

/**
 * Options for one CRM structured-generation call. A deliberately narrow subset
 * of the AI SDK `generateObject` options — the workflows only need a schema, a
 * prompt, and telemetry tags.
 */
export interface CrmGenerateOptions<T extends Record<string, unknown>> {
  /** The Zod schema the model output must satisfy (the EXISTING workflow schema). */
  readonly schema: z.ZodType<T>;
  /** The fully-composed prompt string (the EXISTING workflow prompt). */
  readonly prompt: string;
  /**
   * Langfuse `functionId` tag for this inner call
   * (`crm.infer_profile` | `crm.red_flags`).
   */
  readonly functionId: string;
  /** Extra Langfuse metadata merged onto the telemetry tags. */
  readonly metadata?: TelemetrySettings['metadata'];
}

/**
 * The injectable seam. Returns the validated object, or THROWS on
 * parse/validation/provider failure (which the workflows catch + degrade).
 */
export type CrmGenerateObject = <T extends Record<string, unknown>>(
  options: CrmGenerateOptions<T>,
) => Promise<T>;

/**
 * Build the `experimental_telemetry` block, mirroring `llm-turn.ts`:
 * gated on `isLangfuseConfigured()` so dev/test/no-key is a no-op; never
 * records raw inputs/outputs (PII / data-transfer), only metadata tags.
 */
function buildTelemetry(
  functionId: string,
  metadata: TelemetrySettings['metadata'] | undefined,
  modelId: string,
): TelemetrySettings {
  return {
    isEnabled: isLangfuseConfigured(),
    functionId,
    recordInputs: false,
    recordOutputs: false,
    metadata: {
      runtime: 'crm',
      model: modelId,
      ...metadata,
    },
  };
}

/**
 * Default CRM generate: resolves the shared provider-neutral model from the
 * factory and calls `generateObject`. `createAiSdkModel()` is invoked LAZILY
 * inside this function so a missing/invalid provider key throws THROUGH the
 * caller's try/catch (graceful degradation), never at construction time.
 *
 * `model` is overridable only for the live-smoke harness; production + the unit
 * tests never pass it (tests inject a fake `generate` instead).
 */
export const defaultCrmGenerate: CrmGenerateObject = async <
  T extends Record<string, unknown>,
>(
  options: CrmGenerateOptions<T>,
): Promise<T> => {
  const model: LanguageModel = createAiSdkModel();
  const modelId = typeof model === 'string' ? model : model.modelId;

  // `generateObject`'s overloads key off the schema's inferred OUTPUT type, and
  // a bare generic `T` collapses its internal `T extends string ? "enum"...`
  // discriminant into an unsatisfiable union. We pin the schema to a concrete
  // object schema (`Record<string, unknown>`) for the call so the SDK resolves
  // the "object" overload cleanly, then narrow `object` back to `T`. The Zod
  // schema is still the runtime source of truth for validation (it THROWS
  // NoObjectGeneratedError on a mismatch, which the workflows catch + degrade).
  const { object } = await generateObject({
    model,
    schema: options.schema as z.ZodType<Record<string, unknown>>,
    prompt: options.prompt,
    // OpenAI strict structured outputs (the @ai-sdk/openai DEFAULT, strictJsonSchema
    // = true) require `additionalProperties: false` on every object and reject
    // unsupported JSON-schema keywords (maxLength/maxItems). Both CRM schemas trip
    // this: GeminiProfileSchema.weights is an open `z.record` (→ open
    // additionalProperties), and RedFlagSchema uses `.max()` caps. Under strict
    // mode every real OpenAI call would throw → silently degrade to
    // needs_more_data / {status:'error'} forever. Relax strict mode for THIS call
    // only (not on the shared factory model, which `llm-turn.ts` also uses); the
    // Zod schema remains the runtime validator and still throws on a real mismatch.
    // Namespaced to `openai`, so it's a no-op when AI_PROVIDER=google.
    providerOptions: { openai: { strictJsonSchema: false } },
    experimental_telemetry: buildTelemetry(
      options.functionId,
      options.metadata,
      modelId,
    ),
  });

  return object as T;
};
