/**
 * add-listing-handler — CRM tool handler adapter (AIN-15, Track C Phase 1).
 *
 * Validates args, checks sign-in, calls the `addListing` core, and maps the
 * result into a `ToolResult`. Kicks off `firstSaveAnalysis` fire-and-forget
 * via the `onSaved` dep hook — never awaited.
 *
 * Does NOT register into tool-registry.ts (Phase 2).
 */

import type { ToolContext, ToolResult } from '../../tools/types';
import { addListing, AddListingError } from '../add-listing';
import { firstSaveAnalysis } from '../first-save-analysis';
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
    const result = await addListing(url, {
      extract,
      geocode: geocodeAddress,
      db: context.supabase,
      userId,
      placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
      onSaved: (listingId: string) => {
        void firstSaveAnalysis(listingId, {
          db: context.supabase,
          userId,
          placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
        }).catch(() => {});
      },
    });

    const alreadyNote = result.alreadySaved ? ' (already in CRM)' : '';
    const modelContext = [
      `Saved listing ${result.listingId}${alreadyNote}. Analysis is running.`,
      `Confidence: ${Math.round(result.confidence * 100)}%`,
      '',
      result.alreadySaved
        ? 'INSTRUCTIONS: Tell the user this listing was already in their CRM.'
        : 'INSTRUCTIONS: Confirm the listing was saved. Analysis will appear shortly.',
    ].join('\n');

    const clientContent = result.alreadySaved
      ? `This listing is already saved in your CRM (ID: \`${result.listingId}\`).`
      : `Listing saved to your CRM! I'm running a quick analysis — true cost, red flags, and nearby places will be ready in a moment.`;

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
