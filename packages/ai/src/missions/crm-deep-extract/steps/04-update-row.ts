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
      return { output: { skipped: 'row_gone', updatedFields: [], confidenceBefore: null, confidenceAfter: null, floorPlanCount: 0 } };
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
    const floorPlanCount = floorPlans?.length ?? 0;

    let effectiveRent = synthFields.rent ?? null;
    let effectiveBedrooms = synthFields.bedrooms ?? null;
    let effectiveBathrooms = synthFields.bathrooms ?? null;
    let effectiveSqft = synthFields.sqft ?? null;

    if (floorPlans && floorPlans.length > 0) {
      const computedMin = computeMinRentFromPlans(floorPlans as FloorPlan[]);
      // Prefer computed min over synthesize output if they disagree
      if (computedMin !== null && (effectiveRent === null || computedMin < effectiveRent)) {
        effectiveRent = computedMin;
        // Find the cheapest plan for bed/bath/sqft
        const cheapest = (floorPlans as FloorPlan[]).reduce<FloorPlan | null>((acc, p) => {
          const price = p.rent_min ?? p.rent_max;
          const accPrice = acc?.rent_min ?? acc?.rent_max;
          if (price == null) return acc;
          if (acc === null || accPrice == null || price < accPrice) return p;
          return acc;
        }, null);
        if (cheapest) {
          effectiveBedrooms = cheapest.bedrooms ?? effectiveBedrooms;
          effectiveBathrooms = cheapest.bathrooms ?? effectiveBathrooms;
          effectiveSqft = cheapest.sqft ?? effectiveSqft;
        }
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
    update.raw_extraction = {
      ...existingRaw,
      deep_extract: {
        pages: pages.map((p) => p.url),
        discarded,
        floor_plans: floorPlans ?? null,
        price_is_from: floorPlanCount > 0,
        method: 'mission_v1',
        completed_at: new Date().toISOString(),
      },
    };
    updatedFields.push('raw_extraction');

    // -------------------------------------------------------------------------
    // 5. Persist
    // -------------------------------------------------------------------------
    await ctx.supabase
      .from('crm_listings')
      .update(update)
      .eq('id', listingId)
      .eq('user_id', ctx.userId);

    return {
      output: {
        updatedFields,
        confidenceBefore,
        confidenceAfter,
        floorPlanCount,
      },
    };
  },
};
