/**
 * saved-list-context — the user's saved-listing identity context injected into
 * every CRM-surface chat turn (AIN-91, part of the AIN-91+95 wave).
 *
 * Live motivation: the model was hallucinating an all-zeros listing id when
 * asked to discuss a just-saved listing (AIN-90 incident), and the dashboard
 * renders several listings as bare "Unit" with no distinguishing name. This
 * module gives the model a compact, authoritative view of what the user has
 * saved — id, nickname, title, address, rent, status — so it can resolve
 * "the listing I just added" instead of guessing.
 *
 * Two responsibilities, kept separate per the plan:
 *   - `fetchSavedListContext` — I/O. Reads up to `PROMPT_CONTEXT_LISTING_CAP`
 *     most-recent ACTIVE listings for the user. Never throws — a failed fetch
 *     must never fail the chat turn (degrades to an empty context).
 *   - `renderSavedListingsBlock` — pure. Formats the context into the prompt
 *     block text, including guidance so the model never invents an id.
 *
 * Consumers (Task 6, NOT this file): `runtime/system-prompt.ts` (dynamic
 * suffix, crm-surface gated) and the chat route (fetch beside the profile
 * fetch). This module is imported directly, not re-exported from `./index`
 * — `nickname.ts` (Task 2) sets the same precedent: crm-internal modules are
 * imported by path by the runtime layer, not through the public barrel.
 *
 * Range/truncation note: `.range(0, PROMPT_CONTEXT_LISTING_CAP)` requests
 * `PROMPT_CONTEXT_LISTING_CAP + 1` rows (PostgREST range bounds are
 * inclusive). The extra row is never shown to the model — `listings` is
 * always sliced back down to the cap — but requesting one past the cap lets
 * a caller reason about the shape locally. The precise `truncatedCount` is
 * NOT derived from that extra row; it comes from the exact row count
 * returned alongside `data` (`{ count: 'exact' }` on the same query, one
 * round trip), so the "N more" figure is exact, not a >cap guess.
 *
 * `.range()` is mandatory here, not `.limit()` — PostgREST silently caps
 * `.limit()` at 1000 rows server-side (the well-known trap this codebase has
 * hit before); `.range()` is the only reliable way to bound a query.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrmListingRow } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of saved listings injected into the prompt per turn.
 * The storage cap on crm_listings is 200 (MAX_SAVED_LISTINGS) — injecting
 * every saved listing on every turn would bloat the prompt for power users,
 * so the prompt context is capped much lower and truncation is surfaced to
 * the model explicitly (see `renderSavedListingsBlock`).
 */
export const PROMPT_CONTEXT_LISTING_CAP = 25;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Narrow projection of a CrmListingRow for prompt-injection purposes.
 * Nullable fields mirror CrmListingRow — `id` and `status` are the only
 * fields guaranteed non-null by the DB schema.
 */
export interface SavedListingSummary {
  readonly id: string;
  readonly nickname: string | null;
  readonly title: string | null;
  readonly address: string | null;
  readonly rent: number | null;
  readonly status: CrmListingRow['status'];
}

/** Result of fetching the user's saved-listing prompt context. */
export interface SavedListContext {
  /** Up to PROMPT_CONTEXT_LISTING_CAP most-recent active listings. */
  readonly listings: readonly SavedListingSummary[];
  /**
   * Exact count of additional active listings beyond the cap that are NOT
   * included in `listings` (0 when nothing was truncated).
   */
  readonly truncatedCount: number;
}

/** Empty context returned whenever the fetch degrades (never thrown). */
const EMPTY_CONTEXT: SavedListContext = { listings: [], truncatedCount: 0 };

// ---------------------------------------------------------------------------
// Fetch (I/O)
// ---------------------------------------------------------------------------

/**
 * Fetch the user's saved-listing prompt context: up to
 * PROMPT_CONTEXT_LISTING_CAP most-recent ACTIVE crm_listings rows, plus an
 * exact count of how many more active listings exist beyond the cap.
 *
 * Never throws. Any DB error (network, RLS, malformed response) is logged
 * via `console.warn` and degrades to `{ listings: [], truncatedCount: 0 }` —
 * a failed fetch must never fail the chat turn (mirrors the silent-failure
 * contract used throughout ./crm, e.g. nickname.ts).
 */
export async function fetchSavedListContext(
  db: SupabaseClient,
  userId: string,
): Promise<SavedListContext> {
  try {
    // Cast through unknown, matching the pattern in rank-compare.ts: the
    // supabase-js builder's declared return type doesn't overlap cleanly
    // with a directly-typed Promise via a single `as`.
    const result = await (db
      .from('crm_listings')
      .select('id, nickname, title, address, rent, status', { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('saved_at', { ascending: false })
      .range(0, PROMPT_CONTEXT_LISTING_CAP) as unknown as Promise<{
      data: SavedListingSummary[] | null;
      count: number | null;
      error: unknown;
    }>);

    const { data, count, error } = result;

    if (error) {
      console.warn(`fetchSavedListContext: query failed for user ${userId} — ${String(error)}`);
      return EMPTY_CONTEXT;
    }

    const rows = data ?? [];
    const listings = rows.slice(0, PROMPT_CONTEXT_LISTING_CAP);
    // Prefer the exact count for truncation math; fall back to the fetched
    // row count if `count` is unexpectedly absent (defensive — supabase-js
    // always returns it when `{ count: 'exact' }` is requested).
    const total = count ?? rows.length;
    const truncatedCount = Math.max(0, total - PROMPT_CONTEXT_LISTING_CAP);

    return { listings, truncatedCount };
  } catch (err: unknown) {
    console.warn(`fetchSavedListContext: unexpected failure for user ${userId} — ${String(err)}`);
    return EMPTY_CONTEXT;
  }
}

// ---------------------------------------------------------------------------
// Render (pure)
// ---------------------------------------------------------------------------

const BLOCK_HEADER = "USER'S SAVED LISTINGS (source of truth for \"my list\" questions):";

/**
 * Guidance appended to the block regardless of whether the user has saved
 * listings (decision 6 in the plan) — complements the AIN-90 guardrail that
 * tools already degrade gracefully on bad ids.
 */
const GUIDANCE =
  'Refer to these listings by their name (nickname or title) when talking to the user. ' +
  'When calling a tool that takes a listing id, pass the EXACT id shown here for that listing — ' +
  'NEVER invent or guess a listing id. ' +
  "If the user references a listing that is not in this list, say you can't find it and ask them for the link or address.";

/**
 * Render the saved-listing prompt block. Pure — no I/O, safe to call with a
 * degraded (empty) context.
 *
 * Empty list: still renders a short block stating the user has no saved
 * listings, plus the guidance — an absent block would let the model
 * silently assume the guidance doesn't apply and hallucinate a list.
 */
export function renderSavedListingsBlock(ctx: SavedListContext): string {
  if (ctx.listings.length === 0) {
    return [BLOCK_HEADER, 'The user has no saved listings yet.', GUIDANCE].join('\n');
  }

  const lines = ctx.listings.map((listing) => renderListingLine(listing));

  const truncationLine =
    ctx.truncatedCount > 0
      ? `...and ${ctx.truncatedCount} more saved listings not shown — open My Apartments for the full list.`
      : null;

  return [
    BLOCK_HEADER,
    ...lines,
    ...(truncationLine ? [truncationLine] : []),
    GUIDANCE,
  ].join('\n');
}

/**
 * Maximum length of a sanitized field before truncation (see `sanitizeField`).
 * Bounds prompt growth from arbitrarily long third-party titles/addresses.
 */
const SANITIZED_FIELD_MAX_LENGTH = 80;

/**
 * System-prompt injection guard: `nickname`, `title`, and `address` on a
 * saved listing originate from extracted third-party web pages (untrusted).
 * A crafted title containing newlines could forge additional list lines
 * (e.g. spoofing a fake "id: ..." row) or inject instruction text into the
 * system prompt; embedded double quotes could break the `"..."` framing used
 * around the name. This collapses all whitespace runs (including \n, \r,
 * \t) to a single space, strips double-quote characters, trims, and hard-
 * caps the result at `SANITIZED_FIELD_MAX_LENGTH` chars (appending `…` when
 * truncated).
 *
 * Exported (not module-private) because `nickname.ts` reuses this exact
 * sanitizer for the same title/address fields before building its generation
 * prompt — same untrusted-source, same injection risk, one implementation.
 */
export function sanitizeField(value: string): string {
  const flattened = value.replace(/\s+/g, ' ').replace(/"/g, '').trim();
  return flattened.length > SANITIZED_FIELD_MAX_LENGTH
    ? `${flattened.slice(0, SANITIZED_FIELD_MAX_LENGTH - 1)}…`
    : flattened;
}

/** Render one compact line for a single saved listing. */
function renderListingLine(listing: SavedListingSummary): string {
  const rawName = listing.nickname ?? listing.title ?? listing.address ?? 'Untitled';
  const rawAddress = listing.address ?? 'address unknown';
  const name = sanitizeField(rawName);
  const address = sanitizeField(rawAddress);
  const rent = listing.rent != null ? String(listing.rent) : '?';
  return `- "${name}" — ${address} — $${rent}/mo — id: ${listing.id}`;
}
