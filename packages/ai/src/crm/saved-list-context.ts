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
import type { CrmListingRow, FloorPlan } from './types';
import { DEEP_EXTRACT_ALIAS } from './types';
// AIN-99: sanitizePlanName + FloorPlansArraySchema live in extraction/floor-plan.ts
// and are deliberately NOT re-exported from the extraction barrel (see that
// module's own header) — crm-internal callers import them by path, same
// precedent as the mission's buildFloorPlanDescription in
// missions/crm-deep-extract/steps/04-update-row.ts.
import { sanitizePlanName, FloorPlansArraySchema } from '../extraction/floor-plan';

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

/**
 * Max floor plans rendered per listing in the block (AIN-99). Distinct from
 * `FLOOR_PLAN_MAX_COUNT` (extraction/floor-plan.ts, 40) — that's the storage
 * cap; this is the prompt-rendering cap. A listing with more than this many
 * plans gets an exact `(+K more plans)` remainder note, mirroring the
 * block's own listing-level truncation idiom (see `truncatedCount`).
 */
export const FLOOR_PLANS_PER_LISTING_CAP = 8;

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
  /**
   * Deterministic building-page floor-plan enrichment (AIN-83), surfaced into
   * the prompt block (AIN-99) — CRM chat previously had no read path onto
   * `deep_extract.floor_plans` at all. Always `[]` when the listing has no
   * plans, the fetch degraded, or `deep_extract` is malformed/missing —
   * never `null`/`undefined`, so callers never need an extra nullish check.
   */
  readonly floorPlans: readonly FloorPlan[];
  /**
   * Mirrors `deep_extract.price_is_from` — true when `rent` is the cheapest
   * floor plan's price on a multi-unit building save, not a single fixed
   * rent. Defaults `false` (never inferred true from malformed data).
   */
  readonly priceIsFrom: boolean;
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

/**
 * Raw pre-mapping row shape returned by the select — id/nickname/title/
 * address/rent/status plus the `DEEP_EXTRACT_ALIAS` subtree. Distinct from
 * `SavedListingSummary`, which additionally carries the COMPUTED
 * `floorPlans`/`priceIsFrom` fields (derived from `deep_extract` below, not
 * selected directly).
 */
interface RawSavedListRow {
  readonly id: string;
  readonly nickname: string | null;
  readonly title: string | null;
  readonly address: string | null;
  readonly rent: number | null;
  readonly status: CrmListingRow['status'];
  readonly deep_extract?: CrmListingRow['deep_extract'];
}

/**
 * Parse `deep_extract` into `{ floorPlans, priceIsFrom }`, degrading to
 * `{ floorPlans: [], priceIsFrom: false }` on ANY malformed shape — a bad
 * JSONB blob (wrong type, out-of-range values, corrupt row) must never
 * throw or fail the chat turn, and must never silently drop the field it
 * can't parse (see `EMPTY_CONTEXT`'s same silent-failure contract). Uses
 * `FloorPlansArraySchema` (the same schema the extraction/mission pipelines
 * validate against) for defensive re-validation of untrusted DB content —
 * `safeParse` never throws.
 *
 * Exported (not module-private): `rank-compare.ts` needs the identical
 * `deep_extract` → `{floorPlans, priceIsFrom}` parse for its own compact
 * plan-summary column (AIN-99 Task 2) — one parser, no third copy of the
 * same malformed-JSONB-degrades-safely logic.
 */
export function parseDeepExtractFloorPlans(
  deepExtract: CrmListingRow['deep_extract'],
): { readonly floorPlans: readonly FloorPlan[]; readonly priceIsFrom: boolean } {
  const rawPlans = deepExtract?.floor_plans;
  if (!Array.isArray(rawPlans) || rawPlans.length === 0) {
    return { floorPlans: [], priceIsFrom: false };
  }

  const parsed = FloorPlansArraySchema.safeParse(rawPlans);
  if (!parsed.success) {
    return { floorPlans: [], priceIsFrom: false };
  }

  return {
    floorPlans: parsed.data,
    priceIsFrom: deepExtract?.price_is_from === true,
  };
}

/** Map a raw select row into the prompt-ready `SavedListingSummary`. */
function toSavedListingSummary(row: RawSavedListRow): SavedListingSummary {
  const { floorPlans, priceIsFrom } = parseDeepExtractFloorPlans(row.deep_extract);
  return {
    id: row.id,
    nickname: row.nickname,
    title: row.title,
    address: row.address,
    rent: row.rent,
    status: row.status,
    floorPlans,
    priceIsFrom,
  };
}

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
      .select(`id, nickname, title, address, rent, status, ${DEEP_EXTRACT_ALIAS}`, {
        count: 'exact',
      })
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('saved_at', { ascending: false })
      .range(0, PROMPT_CONTEXT_LISTING_CAP) as unknown as Promise<{
      data: RawSavedListRow[] | null;
      count: number | null;
      error: unknown;
    }>);

    const { data, count, error } = result;

    if (error) {
      console.warn(`fetchSavedListContext: query failed for user ${userId} — ${String(error)}`);
      return EMPTY_CONTEXT;
    }

    const rows = data ?? [];
    const listings = rows.slice(0, PROMPT_CONTEXT_LISTING_CAP).map(toSavedListingSummary);
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
  "If the user references a listing that is not in this list, say you can't find it and ask them for the link or address. " +
  // AIN-101: ambiguous attribute/feature/nickname references must never be
  // silently resolved to a guess — name the candidates and ask.
  'If a reference by attribute, feature, or nickname (e.g. "the one with the dishwasher") matches ' +
  'MORE THAN ONE saved listing, do not silently pick one — name the matching listings and ask the user which one they mean.';

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

/** Render one compact line for a single saved listing, plus an optional floor-plans line. */
function renderListingLine(listing: SavedListingSummary): string {
  const rawName = listing.nickname ?? listing.title ?? listing.address ?? 'Untitled';
  const rawAddress = listing.address ?? 'address unknown';
  const name = sanitizeField(rawName);
  const address = sanitizeField(rawAddress);
  const rentLabel =
    listing.rent != null ? `${listing.priceIsFrom ? 'from $' : '$'}${listing.rent}/mo` : '$?/mo';
  const header = `- "${name}" — ${address} — ${rentLabel} — id: ${listing.id}`;

  const plansLine = renderFloorPlansLine(listing.floorPlans);
  return plansLine ? `${header}\n${plansLine}` : header;
}

/**
 * Render the compact per-listing floor-plans line, or `null` when the
 * listing has none (the caller then emits nothing extra — a no-plans row
 * stays byte-for-byte identical to the pre-AIN-99 output).
 *
 * Cap at `FLOOR_PLANS_PER_LISTING_CAP` plans + an exact `(+K more plans)`
 * remainder, mirroring the block's own listing-level truncation idiom.
 */
function renderFloorPlansLine(plans: readonly FloorPlan[]): string | null {
  if (plans.length === 0) return null;

  const shown = plans.slice(0, FLOOR_PLANS_PER_LISTING_CAP);
  const remainder = plans.length - shown.length;
  const entries = shown.map(renderFloorPlanEntry).join('; ');
  const remainderSuffix = remainder > 0 ? ` (+${remainder} more plans)` : '';

  return `  floor plans (rent is "from" pricing): ${entries}${remainderSuffix}`;
}

/**
 * Render one floor plan, e.g.
 * `Studio (0bd/1ba, 410 sqft) from $1,050 [Available now]`.
 *
 * A `null` rent_min renders the plan name-only (never drop the plan — the
 * AIN-83 0-price-sentinel lesson). Name and availability are third-party
 * page content (injection vectors) — sanitized with the same sanitizers the
 * rest of this module and the extraction pipeline already use, no third copy.
 */
function renderFloorPlanEntry(plan: FloorPlan): string {
  const name = sanitizePlanName(plan.name);

  const specParts: string[] = [];
  if (plan.bedrooms != null || plan.bathrooms != null) {
    const beds = plan.bedrooms != null ? `${plan.bedrooms}bd` : '?bd';
    const baths = plan.bathrooms != null ? `${plan.bathrooms}ba` : '?ba';
    specParts.push(`${beds}/${baths}`);
  }
  if (plan.sqft != null) {
    specParts.push(`${plan.sqft.toLocaleString('en-US')} sqft`);
  }
  const specs = specParts.length > 0 ? ` (${specParts.join(', ')})` : '';

  const price = plan.rent_min != null ? ` from $${plan.rent_min.toLocaleString('en-US')}` : '';
  const availability = plan.availability ? ` [${sanitizeField(plan.availability)}]` : '';

  return `${name}${specs}${price}${availability}`;
}
