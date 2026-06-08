/**
 * add-listing-handler — CRM tool handler adapter (AIN-15, Track C).
 *
 * Validates args, checks sign-in, calls the `addListing` core, and maps the
 * result into a `ToolResult`.
 *
 * AIN-15 Phase 2 — `first_save_analysis` is now MODEL-DRIVEN, not
 * fire-and-forget. After this handler reports the listing was saved (with its
 * id), the `modelContext` instructs the LLM to call the `first_save_analysis`
 * tool with that id. Nothing runs automatically — the previous `onSaved` hook
 * that fired `firstSaveAnalysis` and discarded the result is removed, so the
 * analysis result reaches the user (instead of being thrown away) via the
 * turn loop's generic `tool_result` streaming path.
 */

import type { ToolContext, ToolResult } from '../../tools/types';
import { addListing, AddListingError } from '../add-listing';
import { extractListing } from '../../extraction';
import { geocodeAddress } from '../../tools/lib/geocode-address';
import { addListingInput } from '../schemas';

// ---------------------------------------------------------------------------
// Sign-in gate ToolResult
// ---------------------------------------------------------------------------

const SIGN_IN_RESULT: ToolResult = {
  modelContext: 'CRM action requires sign-in.',
  clientBlock: { type: 'text' as const, content: 'Please sign in to use your personal CRM.' },
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handler for the `add_listing` CRM tool.
 *
 * @param args    - Raw tool arguments (validated via Zod before use).
 * @param context - ToolContext (supabase, userId, campusId, etc.).
 * @returns       A ToolResult — never throws to the runtime.
 */
export async function addListingHandler(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  // --- Sign-in gate ---
  if (!context.userId) {
    return SIGN_IN_RESULT;
  }

  // --- Input validation ---
  const parsed = addListingInput.safeParse(args);
  if (!parsed.success) {
    return {
      modelContext: `Invalid input: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      clientBlock: {
        type: 'text' as const,
        content: "I couldn't understand that URL. Please paste a valid listing link and try again.",
      },
    };
  }

  const { url } = parsed.data;
  const userId = context.userId;

  try {
    // Cast extractListing to match the broader `opts?: unknown` signature in AddListingDeps.
    const extract = extractListing as (url: string, opts?: unknown) => ReturnType<typeof extractListing>;
    // AIN-15 Phase 2: no `onSaved` hook — the analysis is now model-driven
    // (the LLM calls `first_save_analysis` itself; see modelContext below).
    // `onSaved` is optional on the core, so omitting it is a no-op.
    const result = await addListing(url, {
      extract,
      geocode: geocodeAddress,
      db: context.supabase,
      userId,
      placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
    });

    // The model drives analysis via the separate `first_save_analysis` tool.
    // For a NEW save we instruct it FORCEFULLY to chain that call now. For the
    // dedup path the listing was already analyzed on its first save, so we
    // don't auto-chain — but the user may still ask for a fresh analysis.
    const modelContext = result.alreadySaved
      ? [
          `Listing ${result.listingId} was already in the CRM — no new analysis was started.`,
          `Confidence: ${Math.round(result.confidence * 100)}%`,
          '',
          'INSTRUCTIONS: Tell the user this listing is already in their CRM. ' +
            `If they ask for the analysis, call the first_save_analysis tool with listing_id="${result.listingId}".`,
        ].join('\n')
      : [
          `Saved listing ${result.listingId} to the CRM.`,
          `Confidence: ${Math.round(result.confidence * 100)}%`,
          '',
          'INSTRUCTIONS: To show the user the analysis (true cost, red flags, ' +
            'nearby places, steering question), call the first_save_analysis tool ' +
            `now with listing_id="${result.listingId}".`,
        ].join('\n');

    const clientContent = result.alreadySaved
      ? `This listing is already saved in your CRM (ID: \`${result.listingId}\`).`
      : `Listing saved to your CRM! Let me pull up the quick analysis — true cost, red flags, and nearby places.`;

    return {
      modelContext,
      clientBlock: { type: 'text' as const, content: clientContent },
    };
  } catch (err: unknown) {
    if (err instanceof AddListingError) {
      return {
        modelContext: `Add listing failed: ${err.code} — ${err.userMessage}`,
        clientBlock: { type: 'text' as const, content: err.userMessage },
      };
    }
    // Unexpected error — don't leak internals
    return {
      modelContext: `Unexpected error saving listing: ${String(err)}`,
      clientBlock: {
        type: 'text' as const,
        content: "Something went wrong saving that listing. Please try again.",
      },
    };
  }
}
