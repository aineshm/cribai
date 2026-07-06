/**
 * generateListingNickname — background nickname generator for saved listings
 * (AIN-95, part of the AIN-91+95 saved-list-context wave).
 *
 * Every newly-saved crm_listings row gets a short, memorable nickname generated
 * silently in the background (see add-listing.ts's post-insert hook, Task 3).
 * The nickname is the shared handle between the user, the dashboard UI, and the
 * model's saved-list prompt context (AIN-91).
 *
 * Design:
 *   - Mirrors `redFlagsBranch` in first-save-analysis.ts: `deps.generate ??
 *     defaultCrmGenerate`, a narrow Zod schema, `functionId: 'crm.nickname'`.
 *   - Rename-protection: the final UPDATE is guarded `WHERE nickname IS NULL`
 *     at the SQL level, so a user rename (via the PATCH endpoint, Task 4) can
 *     NEVER be silently overwritten by a later/duplicate generation call.
 *   - Uniqueness: the user's existing nicknames are fetched and folded into the
 *     prompt so the model is steered away from collisions (best-effort — not
 *     re-validated against the DB before the update).
 *   - Silent-failure contract: this function NEVER throws. Any failure (missing
 *     row, generation throw, invalid output, update error) degrades to a no-op;
 *     the listing simply falls back to `title` in the UI (decision 8 in the
 *     wave's plan). Failures other than "row not found" are logged via
 *     `console.warn` for operability, never rethrown.
 *
 * Import graph:
 *   ./generate            ← defaultCrmGenerate, CrmGenerateObject (Vercel AI SDK seam)
 *   ./saved-list-context  ← sanitizeField (shared prompt-injection guard for
 *                           title/address, since both fields originate from
 *                           the same untrusted third-party extraction source)
 *   zod                   ← z (NicknameSchema)
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultCrmGenerate } from './generate';
import type { CrmGenerateObject } from './generate';
import { sanitizeField } from './saved-list-context';

// ---------------------------------------------------------------------------
// Schema + validation
// ---------------------------------------------------------------------------

/**
 * Zod schema for the model's nickname response. Deliberately loose at the
 * schema level (any non-empty string) — the 2-4 word / <=40 char shape
 * contract is enforced by `validateNickname` below post-generation, per the
 * plan's "reject/regen not needed — treat as generation failure" decision.
 */
export const NicknameSchema = z.object({
  nickname: z.string(),
});

const MIN_WORDS = 2;
const MAX_WORDS = 4;
const MAX_LENGTH = 40;

/**
 * Validate + normalize a raw model nickname string against the spec:
 * trimmed, 2-4 words, <=40 chars. Returns the trimmed nickname on success,
 * or null when the output violates the contract (treated as a generation
 * failure by the caller — no reject/regen loop).
 */
function validateNickname(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LENGTH) {
    return null;
  }
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) {
    return null;
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Prompt builder (pure)
// ---------------------------------------------------------------------------

/**
 * Input to `buildNicknamePrompt` — the narrow listing fields the nickname
 * depends on, plus the user's existing nicknames for uniqueness steering.
 */
export interface NicknamePromptInput {
  readonly title: string | null;
  readonly address: string | null;
  readonly bedrooms: number | null;
  readonly rent: number | null;
  readonly existingNicknames: readonly string[];
}

/**
 * Build the nickname-generation prompt. Pure function — no I/O.
 *
 * Asks for a short, distinctive 2-4 word name for a saved apartment listing
 * that differs from every existing nickname, captures what's distinctive
 * (street, building, layout), and contains no quotes or emoji.
 *
 * `title` and `address` are run through `sanitizeField` (shared with
 * saved-list-context.ts) before interpolation — both originate from
 * extracted third-party pages and could otherwise carry newlines/quotes
 * that forge extra prompt lines or inject instruction-like text. `bedrooms`
 * and `rent` are numeric (no sanitization needed); `existingNicknames` are
 * already validated 2-4 words / <=40 chars at write time.
 */
export function buildNicknamePrompt(input: NicknamePromptInput): string {
  const { title, address, bedrooms, rent, existingNicknames } = input;

  const safeTitle = title ? sanitizeField(title) : null;
  const safeAddress = address ? sanitizeField(address) : null;

  const titleSection = safeTitle ? `Title: ${safeTitle}` : 'Title: (none)';
  const addressSection = safeAddress ? `Address: ${safeAddress}` : 'Address: (none)';
  const bedroomsSection =
    bedrooms != null ? `Bedrooms: ${bedrooms}` : 'Bedrooms: (unknown)';
  const rentSection = rent != null ? `Rent: $${rent}/mo` : 'Rent: (unknown)';
  const existingSection =
    existingNicknames.length > 0
      ? `Nicknames already in use — the new nickname MUST be different from every one of these:\n${existingNicknames
          .map((n) => `- ${n}`)
          .join('\n')}`
      : 'Nicknames already in use: (none yet)';

  return `You are naming a saved apartment listing for a student's personal housing tracker.

Generate a short, distinctive nickname for this listing — 2 to 4 words, no more than 40 characters total. Capture what makes this listing memorable (e.g. its street name, building name, or unit layout). Do NOT use quotes or emoji. The nickname MUST be different from every nickname already in use, listed below.

${titleSection}
${addressSection}
${bedroomsSection}
${rentSection}

${existingSection}

Return ONLY valid JSON with this exact shape (no extra keys, no markdown):
{
  "nickname": string
}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Identifying params for the listing/user pair to generate a nickname for. */
export interface GenerateListingNicknameParams {
  readonly listingId: string;
  readonly userId: string;
}

/** Dependency bundle — `generate` is optional so unit tests inject a fake. */
export interface GenerateListingNicknameDeps {
  readonly db: SupabaseClient;
  readonly generate?: CrmGenerateObject;
}

/** Narrow projection of the crm_listings row this generator needs. */
interface NicknameSourceRow {
  readonly title: string | null;
  readonly address: string | null;
  readonly bedrooms: number | null;
  readonly rent: number | null;
}

/** Narrow projection used when listing existing nicknames for uniqueness. */
interface ExistingNicknameRow {
  readonly nickname: string | null;
}

/**
 * Generate + persist a nickname for a just-saved listing.
 *
 * Steps:
 *   1. Fetch the listing row (title, address, bedrooms, rent), scoped to
 *      `id` + `user_id`. Row missing (null, no error) → return silently (no
 *      generate call, no log — the expected "already gone" / race case). A
 *      genuine fetch error → `console.warn` (distinguishable from the race)
 *      then return, no generate call.
 *   2. Fetch the user's existing non-null nicknames for uniqueness context.
 *   3. Generate via `deps.generate ?? defaultCrmGenerate`.
 *   4. Validate the output (2-4 words, <=40 chars); invalid → treated as a
 *      generation failure (no update).
 *   5. Update `crm_listings.nickname` — WHERE id + user_id + nickname IS
 *      NULL (rename-protection guard).
 *
 * NEVER throws — every failure path (generation throw, invalid output, update
 * error) degrades to a no-op and resolves. Non-"missing row" failures are
 * logged via `console.warn` for operability.
 */
export async function generateListingNickname(
  params: GenerateListingNicknameParams,
  deps: GenerateListingNicknameDeps,
): Promise<void> {
  const { listingId, userId } = params;

  try {
    // -----------------------------------------------------------------------
    // Step 1: Load the listing row. Missing/errored → silent no-op.
    // -----------------------------------------------------------------------
    const { data: row, error: rowError } = (await deps.db
      .from('crm_listings')
      .select('title, address, bedrooms, rent')
      .eq('id', listingId)
      .eq('user_id', userId)
      .maybeSingle()) as { data: NicknameSourceRow | null; error: unknown };

    if (rowError) {
      console.warn(
        `generateListingNickname: row fetch failed for listing ${listingId} — ${String(rowError)}`,
      );
      return;
    }

    if (row === null) {
      // Expected "already gone" / race case — silent, no log.
      return;
    }

    // -----------------------------------------------------------------------
    // Step 2: Load the user's existing nicknames for uniqueness context.
    // A fetch error here degrades to an empty list — uniqueness is
    // best-effort, not a hard gate on generation.
    // -----------------------------------------------------------------------
    const { data: existingRows, error: existingError } = (await deps.db
      .from('crm_listings')
      .select('nickname')
      .eq('user_id', userId)
      .not('nickname', 'is', null)) as {
      data: ExistingNicknameRow[] | null;
      error: unknown;
    };

    const existingNicknames: readonly string[] = existingError
      ? []
      : (existingRows ?? [])
          .map((r) => r.nickname)
          .filter((n): n is string => typeof n === 'string');

    // -----------------------------------------------------------------------
    // Step 3: Generate. Resolve the seam INSIDE the try so a missing provider
    // key (or any model-resolution throw) degrades like any other failure.
    // -----------------------------------------------------------------------
    const generate = deps.generate ?? defaultCrmGenerate;
    const result = await generate<z.infer<typeof NicknameSchema>>({
      schema: NicknameSchema,
      prompt: buildNicknamePrompt({
        title: row.title,
        address: row.address,
        bedrooms: row.bedrooms,
        rent: row.rent,
        existingNicknames,
      }),
      functionId: 'crm.nickname',
    });

    // -----------------------------------------------------------------------
    // Step 4: Validate output — invalid shape is a generation failure.
    // -----------------------------------------------------------------------
    const nickname = validateNickname(result.nickname);
    if (nickname === null) {
      console.warn(
        `generateListingNickname: model output failed validation for listing ${listingId} — no update applied`,
      );
      return;
    }

    // -----------------------------------------------------------------------
    // Step 5: Update — guarded WHERE nickname IS NULL (rename-protection).
    // -----------------------------------------------------------------------
    const { error: updateError } = await deps.db
      .from('crm_listings')
      .update({ nickname })
      .eq('id', listingId)
      .eq('user_id', userId)
      .is('nickname', null);

    if (updateError) {
      console.warn(
        `generateListingNickname: failed to persist nickname for listing ${listingId} — ${String(updateError)}`,
      );
    }
  } catch (err: unknown) {
    console.warn(
      `generateListingNickname: unexpected failure for listing ${listingId} — ${String(err)}`,
    );
  }
}
