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
import type { CrmListingRow } from '@campusnest/ai';
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

/** Build a CrmUnit from a contract row + the viewing user's id. Pure — never mutates the row. */
export function toCrmUnit(row: CrmListingRow, viewerId: string): CrmUnit {
  return {
    ...row,
    _proposed: {
      unit: {
        building: row.title ?? row.address ?? 'Saved listing',
        floorPlan: '',
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
