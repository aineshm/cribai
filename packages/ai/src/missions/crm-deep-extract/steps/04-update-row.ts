/**
 * update_row step for crm_deep_extract mission (AIN-71).
 *
 * Fill-gaps merge policy: only write columns whose current row value is null/empty.
 * Exceptions: extraction_confidence and raw_extraction always update.
 * Coordinates: SRID=4326;POINT(lng lat) via PostGIS WKT (same as add-listing.ts).
 */

import type { MissionStep, StepContext, StepResult } from '../../types';
import type { DeepExtract, FloorPlan } from './03-synthesize';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrmRow {
  readonly id: string;
  readonly rent: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly address: string | null;
  readonly description: string | null;
  readonly title: string | null;
  readonly available_from: string | null;
  readonly amenities: string[] | null;
  readonly extraction_confidence: number | null;
  readonly raw_extraction: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCoordinatesWkt(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

function isNullish(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Compute min rent from floor plans (recompute to verify synthesize step).
 */
function computeMinRentFromPlans(plans: FloorPlan[]): number | null {
  let min: number | null = null;
  for (const plan of plans) {
    const price = plan.rent_min ?? plan.rent_max;
    if (price != null && (min === null || price < min)) {
      min = price;
    }
  }
  return min;
}

/**
 * Find the cheapest floor plan by rent_min (falling back to rent_max).
 * Shared by the rent-override and the bed/bath/sqft backfill below — both
 * need "which plan is cheapest", not just "what is the cheapest price".
 */
function findCheapestPlan(plans: FloorPlan[]): FloorPlan | null {
  return plans.reduce<FloorPlan | null>((acc, p) => {
    const price = p.rent_min ?? p.rent_max;
    const accPrice = acc?.rent_min ?? acc?.rent_max;
    if (price == null) return acc;
    if (acc === null || accPrice == null || price < accPrice) return p;
    return acc;
  }, null);
}

/**
 * Build a floor-plan description summary for null description rows.
 * e.g. "Property-level save — 2 floor plans: Studio from $899, 2BR/2BA from $1,450."
 */
function buildFloorPlanDescription(plans: FloorPlan[]): string {
  const summaries = plans
    .map((p) => {
      const bedsStr = p.bedrooms === 0 ? 'Studio' : `${p.bedrooms ?? '?'}BR`;
      const bathsStr = p.bathrooms != null ? `/${p.bathrooms}BA` : '';
      const priceStr = p.rent_min != null ? ` from $${p.rent_min.toLocaleString()}` : '';
      return `${bedsStr}${bathsStr}${priceStr}`;
    })
    .join(', ');
  return `Property-level save — ${plans.length} floor plan${plans.length === 1 ? '' : 's'}: ${summaries}.`;
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

export const updateRowStep: MissionStep = {
  id: 'update_row',
  label: 'Updating listing row with deep extraction',

  async run(ctx: StepContext): Promise<StepResult> {
    const listingId = ctx.input.listingId as string;
    const state = ctx.state as Record<string, unknown>;

    const synthFields = (state.fields ?? {}) as DeepExtract;
    const latitude = state.latitude as number | null | undefined;
    const longitude = state.longitude as number | null | undefined;
    const pages = (state.pages ?? []) as Array<{ url: string }>;
    const discarded = (state.discarded ?? []) as Array<{ url: string; reason: string }>;

    // -------------------------------------------------------------------------
    // 1. Load current row
    // -------------------------------------------------------------------------
    const { data: row, error: rowError } = (await ctx.supabase
      .from('crm_listings')
      .select('id, rent, bedrooms, bathrooms, sqft, address, description, title, available_from, amenities, extraction_confidence, raw_extraction')
      .eq('id', listingId)
      .eq('user_id', ctx.userId)
      .maybeSingle()) as { data: CrmRow | null; error: unknown };

    if (rowError || !row) {
      // FIX 6: done:true prevents the reanalyze step running an LLM call against a gone row
      return { output: { skipped: 'row_gone', updatedFields: [], confidenceBefore: null, confidenceAfter: null, floorPlanCount: 0 }, done: true };
    }

    const confidenceBefore = row.extraction_confidence ?? 0;

    // -------------------------------------------------------------------------
    // 2. Build fill-gaps update object
    // -------------------------------------------------------------------------
    const update: Record<string, unknown> = {};
    const updatedFields: string[] = [];

    function fillGap(field: string, rowValue: unknown, newValue: unknown): void {
      if (isNullish(rowValue) && !isNullish(newValue)) {
        update[field] = newValue;
        updatedFields.push(field);
      }
    }

    // Check floor plans and recompute min rent if needed
    const floorPlans = synthFields.floor_plans ?? null;

    let effectiveRent = synthFields.rent ?? null;
    let effectiveBedrooms = synthFields.bedrooms ?? null;
    let effectiveBathrooms = synthFields.bathrooms ?? null;
    let effectiveSqft = synthFields.sqft ?? null;

    if (floorPlans && floorPlans.length > 0) {
      const computedMin = computeMinRentFromPlans(floorPlans as FloorPlan[]);
      // Prefer computed min over synthesize output if they disagree
      if (computedMin !== null && (effectiveRent === null || computedMin < effectiveRent)) {
        effectiveRent = computedMin;
      }

      // AIN-83 live-proof fix: the bed/bath/sqft backfill must NOT be gated
      // on "computed min < effectiveRent" — in the normal deterministic case
      // the baseline rent already EQUALS the cheapest plan's price (rent and
      // floor_plans both derive from the same min-plan computation upstream),
      // so that condition is false and the backfill silently never ran. Any
      // non-empty floor_plans list should backfill the cheapest plan's
      // bed/bath/sqft — fill-gap semantics (existing effective values win)
      // are preserved via `?? `, matching every other field in this step.
      const cheapest = findCheapestPlan(floorPlans as FloorPlan[]);
      if (cheapest) {
        effectiveBedrooms = effectiveBedrooms ?? cheapest.bedrooms ?? null;
        effectiveBathrooms = effectiveBathrooms ?? cheapest.bathrooms ?? null;
        effectiveSqft = effectiveSqft ?? cheapest.sqft ?? null;
      }
    }

    fillGap('title', row.title, synthFields.title);
    fillGap('rent', row.rent, effectiveRent);
    fillGap('bedrooms', row.bedrooms, effectiveBedrooms);
    fillGap('bathrooms', row.bathrooms, effectiveBathrooms);
    fillGap('sqft', row.sqft, effectiveSqft);
    fillGap('address', row.address, synthFields.address);
    fillGap('available_from', row.available_from, synthFields.available_from);

    // Description: fill-gap, but also generate floor-plan summary when applicable
    if (isNullish(row.description)) {
      const desc = synthFields.description
        ?? (floorPlans && floorPlans.length > 0 ? buildFloorPlanDescription(floorPlans as FloorPlan[]) : null);
      if (!isNullish(desc)) {
        update.description = desc;
        updatedFields.push('description');
      }
    }

    if (isNullish(row.amenities) || (row.amenities as string[]).length === 0) {
      if (synthFields.amenities && synthFields.amenities.length > 0) {
        update.amenities = synthFields.amenities;
        updatedFields.push('amenities');
      }
    }

    // Coordinates — always fill when available from places_lookup
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      update.coordinates = makeCoordinatesWkt(latitude, longitude);
      updatedFields.push('coordinates');
    }

    // -------------------------------------------------------------------------
    // 3. Confidence update (always update)
    // -------------------------------------------------------------------------
    const mergedRent = (update.rent as number | undefined) ?? (isNullish(row.rent) ? null : row.rent);
    const mergedAddress = (update.address as string | undefined) ?? (isNullish(row.address) ? null : row.address);

    const confidenceAfter =
      !isNullish(mergedRent) && !isNullish(mergedAddress) ? 0.6 : confidenceBefore;

    update.extraction_confidence = confidenceAfter;
    updatedFields.push('extraction_confidence');

    // -------------------------------------------------------------------------
    // 4. raw_extraction always update
    // -------------------------------------------------------------------------
    const existingRaw = row.raw_extraction ?? {};
    // crawl_blocked: true when step 01 was bot-blocked / unreachable, false on a
    // normal crawl (including a zero-page crawl). Distinguishes blocked missions from
    // successful runs that found no subpages, for debugging and future retry logic.
    const crawlBlocked = (state.crawl as string | undefined) === 'blocked';

    // AIN-83 never-wipe guard: every OTHER deep_extract subfield always
    // overwrites (that's the point of a fresh mission run), but floor_plans
    // is fill-gap-only here. A prior ingest-time seed (Task 3) or an earlier
    // successful mission run may have already written a real plan list; a
    // LATER run that finds nothing this time (blocked re-fetch, or a
    // deterministic+LLM miss) must not null it out. `price_is_from` follows
    // the SAME plans, so it can never claim "from" pricing for an empty list.
    const existingDeepExtract = (
      existingRaw as {
        deep_extract?: {
          floor_plans?: FloorPlan[] | null;
          units_of_interest?: unknown;
        };
      }
    ).deep_extract;
    const persistedFloorPlans: FloorPlan[] | null =
      floorPlans && floorPlans.length > 0
        ? (floorPlans as FloorPlan[])
        : existingDeepExtract?.floor_plans ?? null;
    const persistedFloorPlanCount = persistedFloorPlans?.length ?? 0;

    // AIN-98 never-wipe guard: units_of_interest is written ONLY by
    // addListing's ingest-time seed/accumulation (Tasks 2-4) — this mission's
    // own synthFields NEVER produce it (03-synthesize.ts has no unit-level
    // concept). Every other deep_extract subfield below is a full rebuild
    // (that's the point of a fresh mission run), but this one subtree must
    // survive verbatim or a mission run silently erases what the user viewed
    // at save time. Mirrors the floor_plans never-wipe guard immediately
    // above — same shape, same rationale (AIN-83).
    //
    // Fix 1c residual race window (Review, AIN-98 adjudication): `row` above
    // was read at the TOP of this function (step 1), and the UPDATE below
    // (step 5) is the very next I/O this function performs — everything in
    // between is synchronous computation, no awaited call. So the window in
    // which a concurrent write could land BETWEEN this read and this
    // mission's own write is milliseconds wide, not the length of the whole
    // mission (the crawl + LLM synthesis in steps 01-03 already happened
    // before this step started). `enrichExistingListingWithUnit`'s own
    // append (add-listing.ts) no longer has an analogous window — it's now a
    // single atomic `crm_append_unit_of_interest` UPDATE (migration 047) that
    // can't lose to itself. The ONLY residual risk here is a second
    // `crm_append_unit_of_interest` call landing in that same few-millisecond
    // gap: this step would still carry forward the value it read at its own
    // step-start, silently dropping that one concurrent append. Accepted —
    // this mission runs once per listing (not concurrently with itself), and
    // a unit-view arriving in a multi-millisecond window during someone
    // else's already-running deep-extract mission is a rare enough
    // coincidence that closing it would require this step to also read
    // units_of_interest atomically via SQL rather than through `ctx.supabase`
    // ORM chains — a larger refactor not undertaken here.
    const persistedUnitsOfInterest = existingDeepExtract?.units_of_interest ?? null;

    update.raw_extraction = {
      ...existingRaw,
      deep_extract: {
        pages: pages.map((p) => p.url),
        discarded,
        floor_plans: persistedFloorPlans,
        price_is_from: persistedFloorPlanCount > 0,
        crawl_blocked: crawlBlocked,
        method: 'mission_v1',
        completed_at: new Date().toISOString(),
        units_of_interest: persistedUnitsOfInterest,
      },
    };
    updatedFields.push('raw_extraction');

    // -------------------------------------------------------------------------
    // 5. Persist
    // -------------------------------------------------------------------------
    const { error: updateError } = await ctx.supabase
      .from('crm_listings')
      .update(update)
      .eq('id', listingId)
      .eq('user_id', ctx.userId);

    // FIX 5: surface DB write errors — executor treats throws as retryable
    if (updateError) {
      throw new Error(`update_row: DB write failed: ${(updateError as { message: string }).message}`);
    }

    return {
      output: {
        updatedFields,
        confidenceBefore,
        confidenceAfter,
        // Reflects what's ACTUALLY persisted (this run's plans, or the
        // preserved existing ones under the never-wipe guard) — not just
        // this run's own yield, which could understate a preserved list.
        floorPlanCount: persistedFloorPlanCount,
      },
    };
  },
};
