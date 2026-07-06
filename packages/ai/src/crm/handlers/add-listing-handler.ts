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

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolContext, ToolResult } from '../../tools/types';
import { addListing, AddListingError } from '../add-listing';
import { extractListing } from '../../extraction';
import { geocodeAddress } from '../../tools/lib/geocode-address';
import { addListingInput } from '../schemas';
import type { CrmListingRow } from '../types';
import type { AddListingMachineData } from './types';

// ---------------------------------------------------------------------------
// Post-save read-back (AIN-65)
// ---------------------------------------------------------------------------

/**
 * Explicit crm_listings projection for the post-save read-back. Mirrors
 * `CrmListingRow` — `coordinates` (PostGIS geography) is deliberately omitted
 * because it round-trips as WKB (see ../types.ts). `user_id` stays: it's the
 * requester's own uid (no cross-tenant exposure) and dropping it would make
 * the `CrmListingRow` cast a lie.
 *
 * `satisfies` ties every column name to `CrmListingRow` at compile time so a
 * rename/typo fails tsc instead of rendering `undefined` in cards.
 */
const CRM_LISTING_COLUMN_NAMES = [
  'id',
  'user_id',
  'source_url',
  'source_site',
  'title',
  'nickname',
  'address',
  'rent',
  'bedrooms',
  'bathrooms',
  'sqft',
  'available_from',
  'description',
  'amenities',
  'photo_urls',
  'extraction_confidence',
  'status',
  'user_notes',
  'saved_at',
] as const satisfies readonly (keyof CrmListingRow)[];

const CRM_LISTING_COLUMNS = CRM_LISTING_COLUMN_NAMES.join(', ');

/**
 * Read the saved crm_listings row back so the front end can render
 * SavedUnitCard from `machineData` without a follow-up query.
 *
 * Best-effort: any error (RLS, transient DB failure, missing row) degrades to
 * `null` — the save itself already succeeded and must still be reported.
 */
async function fetchSavedListing(
  db: SupabaseClient,
  userId: string,
  listingId: string,
): Promise<CrmListingRow | null> {
  try {
    const { data, error } = await db
      .from('crm_listings')
      .select(CRM_LISTING_COLUMNS)
      .eq('id', listingId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as CrmListingRow;
  } catch {
    return null;
  }
}

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
  const showCard = parsed.data.show_card ?? true;
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
      // Eval kill-switch: forwards the ToolContext dry-run flag so a model-
      // driven save during an eval run skips the real extract + insert.
      dryRun: context.dryRun,
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

    // AIN-65: read the saved row back so SavedUnitCard can render straight
    // from machineData. Skipped on dry-run (the id is synthetic — no row
    // exists) and best-effort otherwise (null on any read-back failure).
    const listing = context.dryRun
      ? null
      : await fetchSavedListing(context.supabase, userId, result.listingId);

    const machineData: AddListingMachineData = {
      kind: 'add_listing',
      result,
      listing,
      show_card: showCard,
    };

    return {
      machineData,
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
    // Unexpected error — don't leak internals to the model either (it can
    // echo modelContext into user-visible prose). Log raw server-side.
    console.error(`[add_listing] unexpected error: ${String(err)}`);
    return {
      modelContext: 'Unexpected error saving listing: internal error.',
      clientBlock: {
        type: 'text' as const,
        content: "Something went wrong saving that listing. Please try again.",
      },
    };
  }
}
