/**
 * firstSaveAnalysis — CRM "wow moment" workflow (AIN-15, Track C Phase 1).
 *
 * After a listing is saved, runs a PARALLEL FANOUT of 4 independent analyses:
 *   1. trueCost     — calculateTrueCost(@campusnest/utils) on the saved row
 *   2. redFlags     — LLM JSON-mode scan of description + amenities (AI SDK
 *                     generateObject via the shared factory — OpenAI by default)
 *   3. placesSnapshot — Google Places nearbySearch → bucketed categories
 *   4. steeringQuestion — deterministic static question (Phase 1; contextual in Phase 2)
 *
 * Design goals:
 *   - Low perceived latency via Promise.allSettled parallelism — total ≈ the
 *     slowest branch, which is the LLM red-flag scan.
 *   - Per-branch soft timeout (default 5000ms) on I/O branches (redFlags, placesSnapshot).
 *     This is a HANG-CAP, not the expected latency: the red-flag scan now runs on
 *     the shared AI SDK factory (OpenAI gpt-5.4-mini by default), whose structured-
 *     output latency is ~1.6–2.6s — well above the 1200ms cap this used to carry
 *     when the scan was Gemini Flash. 1200ms silently timed the red-flag branch
 *     out on every real OpenAI call; 5000ms admits normal completion while still
 *     capping a genuine hang. (Tunable; lower it if/when a faster model is used.)
 *     NOTE: the underlying LLM/nearbySearch calls have no abort-signal support;
 *     the timeout is a Promise.race soft-cap. The loser's result is discarded.
 *   - NEVER throws after the listing is loaded (step 1). Partial failures degrade
 *     to FanoutBranch<T> with status:'error' or 'skipped'. The overall promise
 *     always resolves to a complete FirstSaveAnalysis struct.
 *   - Exception: if the listing row is not found → throws Error('Listing not found')
 *     BEFORE the fanout. This is the single hard-fail path.
 *
 * Import graph:
 *   ./types           ← FirstSaveAnalysis, FirstSaveAnalysisDeps, FanoutBranch,
 *                       RedFlagResult, PlacesSnapshot, SteeringQuestion, TrueCost
 *   ./amenity-flags   ← amenitiesToCostFlags
 *   ./generate        ← defaultCrmGenerate (AI SDK generateObject seam)
 *   ../tools/lib/google-places ← nearbySearch (default deps.nearby)
 *   @campusnest/utils ← calculateTrueCost, parseWkbPoint
 *   zod               ← z (RedFlagSchema)
 */

import { z } from 'zod';
import { calculateTrueCost, parseWkbPoint } from '@campusnest/utils';
import { defaultCrmGenerate } from './generate';
import { nearbySearch } from '../tools/lib/google-places';
import { amenitiesToCostFlags } from './amenity-flags';
import type {
  FirstSaveAnalysis,
  FirstSaveAnalysisDeps,
  FanoutBranch,
  RedFlagResult,
  PlacesSnapshot,
  SteeringQuestion,
  TrueCost,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BRANCH_TIMEOUT_MS = 5000;
const RADIUS_METERS = 1000;

/** Reason strings — exported as named consts so tests and impl stay in sync. */
const REASON_NO_RENT = 'no rent on listing';
const REASON_NOTHING_TO_SCAN = 'nothing to scan';
const REASON_NO_COORDINATES = 'no coordinates';
const REASON_NO_API_KEY = 'no Places API key';

/** Deterministic steering question — Phase 1. See Phase 2 note in module docstring. */
const STATIC_STEERING_QUESTION =
  "What matters most to you in your next place — price, commute, or space?";

// ---------------------------------------------------------------------------
// Places categorization (mirrored from get-neighborhood-info.ts)
// ---------------------------------------------------------------------------

/**
 * Place types passed to the Places API nearbySearch call.
 * Mirrored from tools/handlers/get-neighborhood-info.ts — do NOT import
 * from the handler (wrong dep direction).
 */
const AMENITY_TYPES = [
  'grocery_or_supermarket',
  'cafe',
  'restaurant',
  'gym',
  'pharmacy',
  'laundry',
] as const;

/**
 * Maps a place's primary type to a display category bucket.
 * Mirrored from tools/handlers/get-neighborhood-info.ts.
 */
const TYPE_CATEGORY_MAP: Readonly<Record<string, string>> = {
  grocery_or_supermarket: 'Grocery',
  cafe: 'Dining',
  restaurant: 'Dining',
  gym: 'Fitness',
  pharmacy: 'Health',
  laundry: 'Services',
};

/**
 * Bucket a list of nearby places into a categories record.
 * Returns a new object — does not mutate the input array.
 */
function categorizePlaces(
  places: readonly { displayName: { text: string }; types?: readonly string[] }[],
): Record<string, readonly string[]> {
  const categories: Record<string, string[]> = {};

  for (const place of places) {
    const primaryType = place.types?.[0] ?? 'other';
    const category = TYPE_CATEGORY_MAP[primaryType] ?? 'Other';
    const existing = categories[category] ?? [];
    categories[category] = [...existing, place.displayName.text];
  }

  return categories;
}

// ---------------------------------------------------------------------------
// Gemini schema for red-flag scan
// ---------------------------------------------------------------------------

/**
 * Zod schema for Gemini's red-flag JSON response.
 * flags: 0-3 short strings (e.g. "lease length not specified")
 * summary: one-sentence rollup
 *
 * Caps are defensive against untrusted model output: per-flag length is bounded
 * and the array is bounded well above the prompt's "0-3" contract (so normal
 * output is never rejected, but a runaway response can't emit an unbounded
 * client string when the handler joins them).
 */
const RedFlagSchema = z.object({
  flags: z.array(z.string().max(200)).max(10),
  summary: z.string().max(500),
});

// ---------------------------------------------------------------------------
// DB row type (narrow projection — NOT CrmListingRow which omits coordinates)
// ---------------------------------------------------------------------------

interface CrmListingSelectRow {
  readonly rent: number | null;
  readonly amenities: readonly string[] | null;
  readonly description: string | null;
  readonly title: string | null;
  readonly address: string | null;
  readonly coordinates: string | null;
}

// ---------------------------------------------------------------------------
// Soft-timeout helper
// ---------------------------------------------------------------------------

/**
 * Race a FanoutBranch promise against a timer.
 * The timer resolves (not rejects) to {status:'error', error:'timeout'} so
 * the winner is always a valid FanoutBranch.
 *
 * NOTE: the loser's underlying fetch/LLM continues running in the background —
 * nearbySearch and Gemini have no abort-signal support. This is intentional;
 * Promise.race is the pragmatic cap here.
 *
 * clearTimeout in finally prevents timer handle leaks when the branch wins.
 */
async function withTimeout<T>(
  branchPromise: Promise<FanoutBranch<T>>,
  ms: number,
): Promise<FanoutBranch<T>> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutBranch = new Promise<FanoutBranch<T>>((resolve) => {
    timerId = setTimeout(
      () => resolve({ status: 'error', error: 'timeout' }),
      ms,
    );
  });
  try {
    return await Promise.race([branchPromise, timeoutBranch]);
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }
}

// ---------------------------------------------------------------------------
// Branch implementations
// ---------------------------------------------------------------------------

/**
 * trueCost branch — pure, synchronous, no I/O.
 * Returns skipped when rent is null; ok otherwise.
 */
async function trueCostBranch(
  row: CrmListingSelectRow,
): Promise<FanoutBranch<TrueCost>> {
  try {
    if (row.rent == null) {
      return { status: 'skipped', reason: REASON_NO_RENT };
    }
    const flags = amenitiesToCostFlags(row.amenities);
    const data = calculateTrueCost({ rentMonthly: row.rent, ...flags });
    return { status: 'ok', data };
  } catch (e: unknown) {
    return { status: 'error', error: String(e) };
  }
}

/**
 * Build the red-flag scan prompt for Gemini.
 */
function buildRedFlagPrompt(description: string | null, amenities: readonly string[] | null): string {
  const descSection = description
    ? `Description:\n${description}`
    : 'Description: (none)';
  const amenitiesSection =
    amenities && amenities.length > 0
      ? `Amenities: ${amenities.join(', ')}`
      : 'Amenities: (none)';

  return `You are a student housing AI. Scan the listing below for red flags a student renter should know about.

Return ONLY valid JSON with this exact shape (no extra keys, no markdown):
{
  "flags": string[],
  "summary": string
}

Rules:
- flags: 0-3 short strings (e.g. "lease length not specified", "pet policy unclear", "only N photos")
- summary: one sentence summarizing the findings
- If no flags found, return an empty array and a positive summary

${descSection}

${amenitiesSection}`;
}

/**
 * redFlags branch — shared LLM via the `generateObject` seam.
 * Skips when both description and amenities are absent.
 *
 * On ANY failure (model/provider construction throw, LLM call throw, OR
 * `generateObject` schema-validation throw — NoObjectGeneratedError) → the outer
 * try/catch returns status:'error'. The overall `firstSaveAnalysis` still
 * resolves; this branch never rethrows. `generateObject` validates against
 * RedFlagSchema and throws on parse/validation failure, so the prior manual
 * JSON.parse + safeParse is gone.
 */
async function redFlagsBranch(
  row: CrmListingSelectRow,
  deps: FirstSaveAnalysisDeps,
): Promise<FanoutBranch<RedFlagResult>> {
  try {
    const hasDescription = row.description != null && row.description.trim().length > 0;
    const hasAmenities = row.amenities != null && row.amenities.length > 0;

    if (!hasDescription && !hasAmenities) {
      return { status: 'skipped', reason: REASON_NOTHING_TO_SCAN };
    }

    // Resolve the seam INSIDE the try so a missing OPENAI_API_KEY (or any
    // model-resolution throw) degrades to {status:'error'} like any other LLM
    // failure — it must not escape this branch.
    const generate = deps.generate ?? defaultCrmGenerate;
    const data = await generate<z.infer<typeof RedFlagSchema>>({
      schema: RedFlagSchema,
      prompt: buildRedFlagPrompt(row.description, row.amenities),
      functionId: 'crm.red_flags',
    });

    return { status: 'ok', data };
  } catch (e: unknown) {
    return { status: 'error', error: String(e) };
  }
}

/**
 * placesSnapshot branch — Google Places nearbySearch → bucketed categories.
 * Skips when coords are null or no Places API key.
 * Wrapped in soft timeout by caller.
 */
async function placesSnapshotBranch(
  coords: { latitude: number; longitude: number } | null,
  deps: FirstSaveAnalysisDeps,
): Promise<FanoutBranch<PlacesSnapshot>> {
  try {
    if (coords === null) {
      return { status: 'skipped', reason: REASON_NO_COORDINATES };
    }
    if (!deps.placesApiKey) {
      return { status: 'skipped', reason: REASON_NO_API_KEY };
    }

    const nearbyFn = deps.nearby ?? nearbySearch;
    const places = await nearbyFn(
      coords.latitude,
      coords.longitude,
      RADIUS_METERS,
      AMENITY_TYPES,
      deps.placesApiKey,
    );

    const categories = categorizePlaces(places);
    return { status: 'ok', data: { categories } };
  } catch (e: unknown) {
    return { status: 'error', error: String(e) };
  }
}

/**
 * steeringQuestion branch — deterministic in Phase 1.
 * Returns the static question immediately; never fails.
 *
 * Phase 2 note: this can be made contextual (LLM-generated based on the
 * user's saved listings and the just-completed analyses). The FanoutBranch
 * shape is already correct for streaming; just replace the static string.
 */
async function steeringQuestionBranch(): Promise<FanoutBranch<SteeringQuestion>> {
  return { status: 'ok', data: { question: STATIC_STEERING_QUESTION } };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run 4 independent analyses in parallel after a listing is saved.
 *
 * @param listingId - The crm_listings row ID to analyse.
 * @param deps      - Dependency bundle (db, userId, generate, nearby, placesApiKey, perBranchTimeoutMs).
 * @returns         A fully-populated FirstSaveAnalysis struct. Each field is a
 *                  FanoutBranch that is always present (ok | skipped | error).
 * @throws {Error}  Only if the listing row is not found (before the fanout).
 *                  All other failures degrade to error/skipped branches.
 */
export async function firstSaveAnalysis(
  listingId: string,
  deps: FirstSaveAnalysisDeps,
): Promise<FirstSaveAnalysis> {
  // -------------------------------------------------------------------------
  // Step 1: Load the row — the only hard-fail path.
  // -------------------------------------------------------------------------
  const { data: row, error: rowError } = (await deps.db
    .from('crm_listings')
    .select('rent, amenities, description, title, address, coordinates')
    .eq('id', listingId)
    .eq('user_id', deps.userId)
    .maybeSingle()) as { data: CrmListingSelectRow | null; error: unknown };

  if (rowError) {
    throw new Error(
      `firstSaveAnalysis: failed to load listing ${listingId} — ${String(rowError)}`,
    );
  }

  if (row === null) {
    throw new Error('Listing not found');
  }

  // Derive coords from the PostGIS WKB column; null if invalid or absent.
  const coords = parseWkbPoint(row.coordinates);

  // -------------------------------------------------------------------------
  // Step 2: Per-branch soft timeout cap (ms).
  // -------------------------------------------------------------------------
  const timeoutMs = deps.perBranchTimeoutMs ?? DEFAULT_BRANCH_TIMEOUT_MS;

  // -------------------------------------------------------------------------
  // Step 3: Fan out all 4 branches in parallel.
  //   - trueCost and steeringQuestion are pure/deterministic — no timeout needed,
  //     but wrapping in allSettled catches any unexpected sync throw.
  //   - redFlags and placesSnapshot are I/O-bound → wrapped in withTimeout.
  //   - allSettled guarantees all 4 settle before we proceed.
  //   - Defensive mapping of 'rejected' settle → {status:'error'} catches any
  //     branch fn that throws synchronously before its inner try/catch fires.
  // -------------------------------------------------------------------------
  const [trueCostResult, redFlagsResult, placesResult, steeringResult] =
    await Promise.allSettled([
      trueCostBranch(row),
      withTimeout(redFlagsBranch(row, deps), timeoutMs),
      withTimeout(placesSnapshotBranch(coords, deps), timeoutMs),
      steeringQuestionBranch(),
    ]);

  function unwrap<T>(
    settled: PromiseSettledResult<FanoutBranch<T>>,
  ): FanoutBranch<T> {
    if (settled.status === 'fulfilled') return settled.value;
    return { status: 'error', error: String(settled.reason) };
  }

  // -------------------------------------------------------------------------
  // Step 4: Return the complete struct — always resolves (never throws here).
  // -------------------------------------------------------------------------
  return {
    listingId,
    trueCost: unwrap(trueCostResult),
    redFlags: unwrap(redFlagsResult),
    placesSnapshot: unwrap(placesResult),
    steeringQuestion: unwrap(steeringResult),
  };
}
