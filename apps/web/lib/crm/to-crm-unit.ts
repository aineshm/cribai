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

/** Build a CrmUnit from a contract row + the viewing user's id. Pure — never mutates the row. */
export function toCrmUnit(row: CrmListingRow, viewerId: string): CrmUnit {
  return {
    ...row,
    photo_urls: httpsPhotoUrls(row.photo_urls),
    source_url: row.source_url != null && isHttpsUrl(row.source_url) ? row.source_url : null,
    _proposed: {
      unit: {
        building: row.nickname ?? row.title ?? row.address ?? 'Saved listing',
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
