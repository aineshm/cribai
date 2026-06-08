/**
 * inferProfile — CRM workflow for preference inference (AIN-15, Track C Phase 1).
 *
 * Reads a user's saved crm_listings, calls Gemini Flash in JSON mode to derive
 * structured preference weights, then upserts `crm_inferred_profiles` via the
 * SERVICE-ROLE client (clients have no INSERT/UPDATE policy on that table per
 * migration 037).
 *
 * Degradation contract:
 *   - If savedCount < minSavesForInference → return needs_more_data, no LLM call, no DB write.
 *   - If Gemini throws, or JSON is unparseable, or Zod schema fails → return needs_more_data, no DB write.
 *   - If the upsert returns an error → log it but still return the inferred profile
 *     (the profile object is the source of truth for the caller; the DB failure is non-fatal).
 *
 * Gemini call pattern mirrors packages/ai/src/intent-classifier.ts lines 60-91 exactly.
 * Track C sprint decision: Gemini Flash for all LLM calls (not Claude).
 *
 * Import graph:
 *   ./types      ← InferProfileDeps, InferProfileResult, InferredProfile, CrmListingRow
 *   ./confidence ← inferenceConfidence
 *   ../gemini-client ← createGeminiClient
 *   zod          ← z (for GeminiProfileSchema)
 */

import { z } from 'zod';
import { createGeminiClient } from '../gemini-client';
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
 * @param deps    - Dependency bundle (readDb, writeDb, gemini, etc.).
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
  // Step 3: Build prompt and call Gemini Flash (JSON mode).
  //         Mirrors intent-classifier.ts lines 60-91 exactly.
  // ---------------------------------------------------------------------------
  let geminiText: string;
  try {
    // Construct the client INSIDE the guard: createGeminiClient() throws when
    // Gemini env/credentials are missing or invalid, and that must degrade to
    // needs_more_data (no write) like any other LLM failure — not reject.
    const ai = deps.gemini ?? createGeminiClient();
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        responseMimeType: 'application/json',
        // NOTE: NO tools config here — responseMimeType + tools are mutually exclusive in Gemini
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: buildInferProfilePrompt(serializeListingsForPrompt(rows)) }],
        },
      ],
    });
    geminiText = result.text ?? '{}';
  } catch (err: unknown) {
    // Gemini threw (network, quota, etc.) — degrade gracefully.
    console.error('[inferProfile] Gemini call failed:', err);
    return {
      status: 'needs_more_data',
      savedCount,
      steeringQuestion: STEERING_QUESTION,
    };
  }

  // ---------------------------------------------------------------------------
  // Step 4: Parse defensively — wrap JSON.parse in try/catch; safeParse via Zod.
  //         If either fails → needs_more_data, no DB write.
  // ---------------------------------------------------------------------------
  let parsedData: GeminiProfile | null = null;
  try {
    const raw = JSON.parse(geminiText) as unknown;
    const safeResult = GeminiProfileSchema.safeParse(raw);
    if (safeResult.success) {
      parsedData = safeResult.data;
    }
  } catch {
    // JSON.parse threw — malformed response, degrade.
  }

  if (parsedData === null) {
    // Parse or validation failed — do NOT write the DB.
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

  // ---------------------------------------------------------------------------
  // Step 8: Return success.
  // ---------------------------------------------------------------------------
  return {
    status: 'inferred',
    profile,
  };
}
