/**
 * toCrmUnit (AIN-61) — adapt a real CrmListingRow (GET /api/crm/listings) into
 * the CrmUnit shape the dashboard/canvas consume.
 *
 * The `_proposed` extensions are NOT in the backend contract yet (see
 * CONTRACT-DELTAS.md), so this adapter synthesizes HONEST defaults only:
 *   - application stage derived from the row's `status` (no fabricated
 *     deadlines, submission dates, or document checklists)
 *   - all amenities unit-scoped (no invented unit/building split)
 *   - addedBy = the current viewer (collaboration is mock-only; every real row
 *     belongs to the viewer per RLS)
 */
import type { CrmListingRow, FloorPlan, SelectedUnit } from '@campusnest/ai';
import type { ApplicationState, CrmUnit } from './proposed-types';

/** crm_listings.status → application pipeline stage. */
const STAGE_BY_STATUS: Readonly<Record<CrmListingRow['status'], ApplicationState['stage']>> = {
  active: 'saved',
  toured: 'toured',
  applied: 'applied',
  declined: 'decision',
  // Archived rows are filtered out server-side; mapped defensively anyway.
  archived: 'saved',
};

function deriveUnitLabel(bedrooms: number | null): string {
  if (bedrooms == null) return 'Unit';
  if (bedrooms === 0) return 'Studio';
  return `${bedrooms} bed`;
}

/** True only for absolute https: URLs (URL parsing lowercases the scheme). */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * AIN-65 fold-in — photo_urls render straight into `<img src>` downstream
 * (SavedUnitCard, ApplicationPipeline, UnitDetailDrawer) with no scheme
 * filter, so this adapter is the single chokepoint that drops anything that
 * isn't an absolute https: URL (mixed-content / tracking vector otherwise).
 * `null` stays `null` — "no photos" is honest, not coerced to `[]`.
 */
function httpsPhotoUrls(urls: readonly string[] | null): readonly string[] | null {
  if (urls === null) return null;
  return urls.filter(isHttpsUrl);
}

/**
 * The single label the UI can show for "the floor plan" of this row (e.g. in
 * the drawer header, next to the listing name). Only resolves to a real name
 * when there's EXACTLY one plan — a multi-plan building save has no single
 * honest label (that's what the new Floor Plans list section is for); zero
 * plans (legacy rows, single-unit saves with no plan data) also stays empty.
 */
function deriveFloorPlanLabel(floorPlans: readonly FloorPlan[]): string {
  return floorPlans.length === 1 ? floorPlans[0]!.name : '';
}

/**
 * Units the user viewed on this building's page before saving (AIN-98),
 * read from `deep_extract.units_of_interest`. Never fabricated — a
 * malformed/non-array value (corrupt JSONB, wrong shape) degrades to `[]`,
 * same contract as `floorPlans` above.
 */
function deriveUnitsOfInterest(units: unknown): readonly SelectedUnit[] {
  return Array.isArray(units) ? (units as SelectedUnit[]) : [];
}

/** Build a CrmUnit from a contract row + the viewing user's id. Pure — never mutates the row. */
export function toCrmUnit(row: CrmListingRow, viewerId: string): CrmUnit {
  // AIN-83: real per-plan breakdown, read from the deep_extract subtree
  // (never fabricated — absent/null degrades to "no plans").
  const floorPlans = row.deep_extract?.floor_plans ?? [];
  const priceIsFrom = row.deep_extract?.price_is_from ?? false;
  // AIN-98: units the user viewed on this building before saving.
  const unitsOfInterest = deriveUnitsOfInterest(row.deep_extract?.units_of_interest);

  return {
    ...row,
    photo_urls: httpsPhotoUrls(row.photo_urls),
    source_url: row.source_url != null && isHttpsUrl(row.source_url) ? row.source_url : null,
    floorPlans,
    priceIsFrom,
    unitsOfInterest,
    _proposed: {
      unit: {
        building: row.nickname ?? row.title ?? row.address ?? 'Saved listing',
        floorPlan: deriveFloorPlanLabel(floorPlans),
        unitLabel: deriveUnitLabel(row.bedrooms),
      },
      amenitySplit: {
        unit: row.amenities ?? [],
        building: [],
      },
      application: {
        stage: STAGE_BY_STATUS[row.status],
        deadline: null,
        deadlineLabel: null,
        submittedAt: null,
        documents: [],
      },
      addedBy: viewerId,
    },
  };
}
