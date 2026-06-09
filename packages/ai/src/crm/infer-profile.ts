/**
 * inferProfile — CRM workflow for preference inference (AIN-15, Track C Phase 1).
 *
 * Reads a user's saved crm_listings, calls the shared LLM (Vercel AI SDK
 * `generateObject` via the provider-neutral factory — OpenAI `gpt-5.4-mini` by
 * default) to derive structured preference weights, then upserts
 * `crm_inferred_profiles` via the SERVICE-ROLE client (clients have no
 * INSERT/UPDATE policy on that table per migration 037).
 *
 * Degradation contract:
 *   - If savedCount < minSavesForInference → return needs_more_data, no LLM call, no DB write.
 *   - If the LLM call throws, OR model/provider construction throws (e.g. missing
 *     OPENAI_API_KEY), OR `generateObject` fails schema validation (it throws
 *     NoObjectGeneratedError) → return needs_more_data, no DB write.
 *   - If the upsert returns an error → log it but still return the inferred profile
 *     (the profile object is the source of truth for the caller; the DB failure is non-fatal).
 *
 * The LLM call goes through the injectable `deps.generate` seam (see ./generate),
 * which defaults to the shared factory + Langfuse telemetry. `generateObject`
 * validates against `GeminiProfileSchema` and throws on parse/validation failure,
 * so there is no manual JSON.parse / safeParse here anymore.
 *
 * Import graph:
 *   ./types      ← InferProfileDeps, InferProfileResult, InferredProfile, CrmListingRow
 *   ./confidence ← inferenceConfidence
 *   ./generate   ← defaultCrmGenerate (AI SDK generateObject seam)
 *   zod          ← z (for GeminiProfileSchema)
 */

import { z } from 'zod';
import { defaultCrmGenerate } from './generate';
import { inferenceConfidence } from './confidence';
import { SCORING_FEATURES } from './scoring-features';
import type {
  InferProfileDeps,
  InferProfileResult,
  InferredProfile,
  CrmListingRow,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MIN_SAVES = 3;

const STEERING_QUESTION =
  "What matters most in your next place — price, commute, or space?";

// ---------------------------------------------------------------------------
// Gemini output schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for the JSON Gemini returns. Intentionally does NOT include
 * `confidence` — that field is computed locally from savedCount via
 * `inferenceConfidence()`. If Gemini includes it anyway, Zod strips it.
 *
 * Prompt instructs: "Weights should sum to ~1.0 and cover price/commute/space/amenities."
 */
const GeminiProfileSchema = z.object({
  rent_min: z.number().nullable(),
  rent_max: z.number().nullable(),
  bedrooms_target: z.number().nullable(),
  must_have_amenities: z.array(z.string()),
  nice_to_have_amenities: z.array(z.string()),
  home_base_address: z.string().nullable(),
  commute_max_minutes: z.number().int().nullable(),
  weights: z.record(z.string(), z.number()),
});

type GeminiProfile = z.infer<typeof GeminiProfileSchema>;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Serialize the listings into a compact, prompt-friendly text block.
 * Returns a new string — does not mutate the row array.
 */
function serializeListingsForPrompt(rows: readonly CrmListingRow[]): string {
  return rows
    .map((row, i) => {
      const amenitiesStr =
        row.amenities && row.amenities.length > 0
          ? row.amenities.join(', ')
          : 'none listed';
      return [
        `Listing ${i + 1}:`,
        `  Title: ${row.title ?? 'Unknown'}`,
        `  Rent: ${row.rent != null ? `$${row.rent}/mo` : 'unknown'}`,
        `  Bedrooms: ${row.bedrooms ?? 'unknown'}, Bathrooms: ${row.bathrooms ?? 'unknown'}`,
        `  Sqft: ${row.sqft ?? 'unknown'}`,
        `  Amenities: ${amenitiesStr}`,
        `  Address: ${row.address ?? 'unknown'}`,
      ].join('\n');
    })
    .join('\n\n');
}

/**
 * Build the Gemini prompt for profile inference.
 * The prompt instructs Gemini to return valid JSON matching GeminiProfileSchema.
 *
 * The weights instruction is derived from SCORING_FEATURES (single source of truth)
 * so adding a new scoring dimension automatically updates the prompt too.
 */
function buildInferProfilePrompt(listings: string): string {
  // Build the weights key instruction from the canonical vocabulary so Gemini
  // emits keys that rank-compare.ts resolveWeights can read directly.
  const weightKeyGloss: Record<string, string> = {
    rent: 'price/affordability importance',
    bedrooms: 'bedroom-count importance',
    sqft: 'space importance',
    commute: 'commute importance',
  };
  const weightsInstruction = SCORING_FEATURES
    .map((f) => `  "${f}": <0-1> (${weightKeyGloss[f] ?? f})`)
    .join(',\n');
  const weightsExample = SCORING_FEATURES
    .map((f, i) => `  "${f}": ${i === 0 ? '0.4' : i === 1 ? '0.2' : i === 2 ? '0.2' : '0.2'}`)
    .join(',\n');

  return `You are a student housing AI. Analyze the following saved listings and infer a structured preference profile.

Return ONLY valid JSON with this exact shape (no extra keys, no markdown):
{
  "rent_min": number | null,
  "rent_max": number | null,
  "bedrooms_target": number | null,
  "must_have_amenities": string[],
  "nice_to_have_amenities": string[],
  "home_base_address": string | null,
  "commute_max_minutes": integer | null,
  "weights": {
${weightsInstruction}
  }
}

Example weights (must use EXACTLY these key names):
{
${weightsExample}
}

Rules:
- Weights keys MUST be exactly: ${SCORING_FEATURES.map((f) => `"${f}"`).join(', ')}. Do not use synonyms or alternative labels.
- Weights should sum to ~1.0.
- Use null for any field you cannot infer from the listings.
- must_have_amenities: amenities present in most listings.
- nice_to_have_amenities: amenities present in some listings.

Saved listings:
${listings}`;
}

/**
 * Normalize the weights record so values sum to 1.
 * If all values are zero or the map is empty, returns the original weights unchanged.
 * Returns a new object — does not mutate the input.
 */
function normalizeWeights(
  weights: Readonly<Record<string, number>>,
): Record<string, number> {
  const entries = Object.entries(weights);
  if (entries.length === 0) return { ...weights };

  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (total === 0) return { ...weights };

  return Object.fromEntries(entries.map(([k, v]) => [k, v / total]));
}

/**
 * Build the InferredProfile from parsed Gemini output + computed confidence.
 * Returns a new object — does not mutate the input.
 */
function buildProfile(
  parsed: GeminiProfile,
  savedCount: number,
): InferredProfile {
  const normalizedWeights = normalizeWeights(parsed.weights);
  return {
    rent_min: parsed.rent_min,
    rent_max: parsed.rent_max,
    bedrooms_target: parsed.bedrooms_target,
    must_have_amenities: parsed.must_have_amenities,
    nice_to_have_amenities: parsed.nice_to_have_amenities,
    home_base_address: parsed.home_base_address,
    commute_max_minutes: parsed.commute_max_minutes,
    weights: normalizedWeights,
    confidence: inferenceConfidence(savedCount),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Infer a structured housing-preference profile from the user's saved listings.
 *
 * @param userId  - The authenticated user's ID. Used as the source of truth
 *                  (asserted against deps.userId implicitly — callers pass one value).
 * @param deps    - Dependency bundle (readDb, writeDb, generate, etc.).
 * @returns       - `{status:'inferred', profile}` on success;
 *                  `{status:'needs_more_data', savedCount, steeringQuestion}` otherwise.
 *
 * Error handling: LLM/parse errors are absorbed and degrade to needs_more_data;
 * upsert (write) errors are logged and still return the inferred profile. The
 * one intentional throw is a failed listings READ (FIX 3) — a real DB read
 * failure must surface to the caller, not masquerade as "needs more data".
 */
export async function inferProfile(
  userId: string,
  deps: InferProfileDeps,
): Promise<InferProfileResult> {
  // ---------------------------------------------------------------------------
  // Step 1: Read saved active listings via the RLS-bound client.
  // ---------------------------------------------------------------------------
  const listingsResult = await (deps.readDb
    .from('crm_listings')
    .select('id, title, rent, bedrooms, bathrooms, sqft, amenities, address, status')
    .eq('user_id', userId)
    .eq('status', 'active') as unknown as Promise<{ data: CrmListingRow[] | null; error: unknown }>);

  if (listingsResult.error) {
    console.error('[inferProfile] failed to read saved listings:', listingsResult.error);
    throw new Error('inferProfile: failed to read saved listings');
  }

  const rows: CrmListingRow[] = listingsResult.data ?? [];
  const savedCount = rows.length;

  // ---------------------------------------------------------------------------
  // Step 2: Gate on minimum count.
  // ---------------------------------------------------------------------------
  const min = deps.minSavesForInference ?? DEFAULT_MIN_SAVES;
  if (savedCount < min) {
    return {
      status: 'needs_more_data',
      savedCount,
      steeringQuestion: STEERING_QUESTION,
    };
  }

  // ---------------------------------------------------------------------------
  // Step 3 & 4: Call the shared LLM via the `generateObject` seam.
  //
  //   - The seam is constructed/resolved INSIDE this guard so a missing
  //     OPENAI_API_KEY (or any model-resolution throw) degrades to
  //     needs_more_data (no write), exactly like the old createGeminiClient()
  //     -inside-try contract — it must NOT reject out of the workflow.
  //   - `generateObject` validates against GeminiProfileSchema and throws
  //     NoObjectGeneratedError on parse/validation failure, so the prior manual
  //     JSON.parse + safeParse is gone; any such throw lands in this catch and
  //     degrades to needs_more_data with NO DB write.
  // ---------------------------------------------------------------------------
  const generate = deps.generate ?? defaultCrmGenerate;
  let parsedData: GeminiProfile;
  try {
    parsedData = await generate<GeminiProfile>({
      schema: GeminiProfileSchema,
      prompt: buildInferProfilePrompt(serializeListingsForPrompt(rows)),
      functionId: 'crm.infer_profile',
      metadata: { savedCount },
    });
  } catch (err: unknown) {
    // LLM/model-resolution threw, or the response failed schema validation —
    // degrade gracefully. Do NOT write the DB.
    console.error('[inferProfile] profile generation failed:', err);
    return {
      status: 'needs_more_data',
      savedCount,
      steeringQuestion: STEERING_QUESTION,
    };
  }

  // ---------------------------------------------------------------------------
  // Step 5 & 6: Normalize weights + compute confidence.
  //             buildProfile returns a new object (immutable).
  // ---------------------------------------------------------------------------
  const profile = buildProfile(parsedData, savedCount);

  // ---------------------------------------------------------------------------
  // Step 7: Upsert via the SERVICE-ROLE client (writeDb).
  //         The `onConflict: 'user_id'` option is required — without it,
  //         conflicts error instead of updating.
  //
  //         Decision: if upsert errors, log + still return the inferred profile.
  //         The profile object is the authoritative result for the caller.
  // ---------------------------------------------------------------------------
  const upsertRow: Record<string, unknown> = {
    user_id: userId,
    rent_min: profile.rent_min,
    rent_max: profile.rent_max,
    bedrooms_target: profile.bedrooms_target,
    must_have_amenities: profile.must_have_amenities,
    nice_to_have_amenities: profile.nice_to_have_amenities,
    home_base_address: profile.home_base_address,
    commute_max_minutes: profile.commute_max_minutes,
    weights: profile.weights,
    confidence: profile.confidence,
    // NOTE: last_updated_at is intentionally omitted — a DB trigger handles it.
  };

  // Eval dry-run gate (mirrors create-sublease / schedule-tour). The eval
  // runner drives the real registry with `dryRun: true` + a service-role
  // client, so the inference's only side effect — this service-role upsert into
  // crm_inferred_profiles — MUST be skipped. We keep the read + Gemini compute
  // above (those are not writes) and return the already-computed profile, the
  // authoritative result for the caller. Live traffic is always
  // `dryRun=false` (default), so the prod write path below is unchanged.
  if (!deps.dryRun) {
    const upsertResult = await deps.writeDb
      .from('crm_inferred_profiles')
      .upsert(upsertRow, { onConflict: 'user_id' });

    if (upsertResult && (upsertResult as { error?: unknown }).error) {
      console.error(
        '[inferProfile] Upsert to crm_inferred_profiles failed:',
        (upsertResult as { error: unknown }).error,
      );
      // Non-fatal: profile is still valid, return it.
    }
  }

  // ---------------------------------------------------------------------------
  // Step 8: Return success.
  // ---------------------------------------------------------------------------
  return {
    status: 'inferred',
    profile,
  };
}
