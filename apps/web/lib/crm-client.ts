/**
 * The single CRM data seam every "My Apartments" surface talks to.
 *
 * Mock mode (default) returns the local fixtures after a small delay so loading
 * states render honestly. Real mode calls /api/crm/* (stubbed until the Track C
 * Phase-2 endpoints land — see engineering/mockups/crm-frontend/WIRING-GUIDE.md).
 *
 * Flip via NEXT_PUBLIC_CRM_MOCK: anything other than the literal 'false' keeps
 * the mock; 'false' points at the real backend.
 */
import type { AddListingResult, FirstSaveAnalysis, RankCompareResult } from '@campusnest/ai';
import type { CrmList, CrmUnit } from './crm/proposed-types';
import {
  ADD_LISTING_RESULT,
  ANALYSIS_FULL,
  ANALYSIS_PARTIAL,
  COMPARE_RESULT,
  CRM_LIST,
  RANK_RESULT,
  UNITS,
} from './crm/fixtures';

export interface CrmClient {
  listUnits(): Promise<CrmUnit[]>;
  getList(): Promise<CrmList>;
  addListing(sourceUrl: string): Promise<AddListingResult>;
  getAnalysis(listingId: string): Promise<FirstSaveAnalysis>;
  rank(mode: 'rank' | 'compare'): Promise<RankCompareResult>;
  deleteUnit(listingId: string): Promise<void>;
  firstUnitId(): string;
}

/** The hero unit id (Chapter S1) — mock-only handle the workspace seeds from. */
const FIRST_UNIT_ID = UNITS[0]?.id ?? 'crm_chapter_s1';

const wait = <T>(value: T, ms = 350): Promise<T> =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const mockClient: CrmClient = {
  listUnits: () => wait(UNITS),
  getList: () => wait(CRM_LIST),
  addListing: () => wait(ADD_LISTING_RESULT),
  getAnalysis: (id) => wait(id === FIRST_UNIT_ID ? ANALYSIS_FULL : ANALYSIS_PARTIAL),
  rank: (mode) => wait(mode === 'compare' ? COMPARE_RESULT : RANK_RESULT),
  deleteUnit: () => wait(undefined),
  firstUnitId: () => FIRST_UNIT_ID,
};

// Real impl: calls /api/crm/* (see WIRING-GUIDE.md). Stubbed until the Phase-2
// endpoints exist; methods that have no backend yet throw a clear error.
const realClient: CrmClient = {
  listUnits: async () => (await fetch('/api/crm/listings')).json() as Promise<CrmUnit[]>,
  getList: async () => {
    throw new Error('crm list endpoint not implemented (Phase 2)');
  },
  addListing: async (sourceUrl) =>
    (
      await fetch('/api/crm/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceUrl }),
      })
    ).json() as Promise<AddListingResult>,
  getAnalysis: async (id) =>
    (await fetch(`/api/crm/listings/${id}/analysis`)).json() as Promise<FirstSaveAnalysis>,
  rank: async (mode) =>
    (
      await fetch('/api/crm/rank', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
    ).json() as Promise<RankCompareResult>,
  deleteUnit: async (id) => {
    await fetch(`/api/crm/listings/${id}`, { method: 'DELETE' });
  },
  firstUnitId: () => {
    throw new Error('firstUnitId is mock-only');
  },
};

const USE_MOCK = process.env.NEXT_PUBLIC_CRM_MOCK !== 'false';

export const crmClient: CrmClient = USE_MOCK ? mockClient : realClient;
