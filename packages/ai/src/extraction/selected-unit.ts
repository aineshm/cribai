/**
 * Shared `SelectedUnit` shape (AIN-98 Task 2).
 *
 * A Zillow BUILDING page's URL fragment (`#udp-<zpid>`) identifies which
 * specific unit the user was viewing when they saved — AIN-94's motivating
 * example: the Trinity save recorded $3,693 (a "from" price) while the
 * founder was viewing Unit 504 at $5,278. `resolveZillowUnit`
 * (`sites/zillow.ts`) projects that zpid into a `RawSelectedUnit`; `addListing`
 * stamps `viewed_at` and accumulates it into `deep_extract.units_of_interest`
 * (a capped, zpid-deduped, most-recent-last list — never a single
 * "current selection" field, since a user may view several units across
 * repeat visits before deciding).
 *
 * Deliberately Zillow-only: apartments.com fragments (`#<key>-<n>-unit`,
 * `#<key>-<n>-floorPlan`) carry no structured per-unit data, so they're
 * recognized by `parseUnitFragment` (../crm/source-url.ts) but never
 * resolved to a `SelectedUnit` — see the AIN-98 plan's explicit
 * out-of-scope note.
 *
 * Bounds mirror `FloorPlanSchema` (./floor-plan.ts) — same untrusted-source
 * shape (third-party page content), same caps.
 */

import { z } from 'zod';
import { FLOOR_PLAN_NAME_MAX, FLOOR_PLAN_AVAILABILITY_MAX } from './floor-plan';

/** Max free-text length for a unit number / label (e.g. "Unit 1405"). */
export const UNIT_NUMBER_MAX = 80;
/** Max free-text length for a floor label (e.g. "3rd Floor"). Zillow's raw
 *  `floor` field is nearly always null in practice; kept generous. */
export const UNIT_FLOOR_MAX = 40;
/** Max units_of_interest entries persisted per listing (accumulator cap). */
export const SELECTED_UNIT_MAX_COUNT = 12;

/**
 * The unit-level fields `resolveZillowUnit` can project off a Zillow
 * building page's `floorPlans[].units[]` blob. `zpid` is the only field
 * guaranteed present — everything else degrades to absent when the source
 * data doesn't carry it (never fabricated).
 */
export const RawSelectedUnitSchema = z.object({
  zpid: z.string().min(1).max(64),
  unit_number: z.string().max(UNIT_NUMBER_MAX).nullish(),
  plan_name: z.string().max(FLOOR_PLAN_NAME_MAX).nullish(),
  price: z.number().positive().max(50_000).nullish(),
  bedrooms: z.number().min(0).max(20).nullish(),
  bathrooms: z.number().min(0).max(20).nullish(),
  sqft: z.number().positive().max(50_000).nullish(),
  floor: z.string().max(UNIT_FLOOR_MAX).nullish(),
  availability: z.string().max(FLOOR_PLAN_AVAILABILITY_MAX).nullish(),
});

export type RawSelectedUnit = z.infer<typeof RawSelectedUnitSchema>;

/**
 * The persisted accumulator entry: a `RawSelectedUnit` plus the ISO
 * timestamp `addListing` stamps at save time (NOT set by `resolveZillowUnit`
 * — resolution is a pure projection, "when" is the caller's concern).
 */
export const SelectedUnitSchema = RawSelectedUnitSchema.extend({
  viewed_at: z.string().datetime(),
});

export type SelectedUnit = z.infer<typeof SelectedUnitSchema>;

/** An array of accumulated units, capped at `SELECTED_UNIT_MAX_COUNT`. */
export const SelectedUnitsArraySchema = z.array(SelectedUnitSchema).max(SELECTED_UNIT_MAX_COUNT);
