/**
 * The single CRM data seam every "My Apartments" surface talks to.
 *
 * Mock mode (default) returns the local fixtures after a small delay so loading
 * states render honestly. Real mode calls the /api/crm/* REST routes (AIN-61):
 *
 *   listUnits  → GET    /api/crm/listings  (rows adapted via toCrmUnit)
 *   getList    → GET    /api/crm/listings  (single-member list synthesized from
 *                                           the session viewer — collaboration
 *                                           stays mock-only, no crm_lists table)
 *   addListing → POST   /api/crm/listings
 *   getAnalysis→ GET    /api/crm/listings/:id/analysis
 *   rank       → POST   /api/crm/rank
 *   deleteUnit → DELETE /api/crm/listings/:id
 *
 * Flip via NEXT_PUBLIC_CRM_MOCK: anything other than the literal 'false' keeps
 * the mock; 'false' points at the real backend.
 */
import type { AddListingResult, CrmListingRow, FirstSaveAnalysis, RankCompareResult } from '@campusnest/ai';
import type { CrmList, CrmUnit } from './crm/proposed-types';
import { toCrmUnit } from './crm/to-crm-unit';
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
  // Hero unit = a fresh paste with no coordinates yet → the honest PARTIAL
  // analysis (skipped places branch). Other units → the all-ok analysis.
  getAnalysis: (id) => wait(id === FIRST_UNIT_ID ? ANALYSIS_PARTIAL : ANALYSIS_FULL),
  rank: (mode) => wait(mode === 'compare' ? COMPARE_RESULT : RANK_RESULT),
  deleteUnit: () => wait(undefined),
  firstUnitId: () => FIRST_UNIT_ID,
};

// ---------------------------------------------------------------------------
// Real client — /api/crm/* (AIN-61)
// ---------------------------------------------------------------------------

/** Envelope returned by GET /api/crm/listings. */
interface ListingsPayload {
  readonly listings: readonly CrmListingRow[];
  readonly viewer: { readonly id: string; readonly name: string };
}

/** Fetch JSON, throwing the server's `error` message (or a status fallback) on non-2xx. */
async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body: unknown = await response.json();
      if (
        body !== null &&
        typeof body === 'object' &&
        typeof (body as { error?: unknown }).error === 'string'
      ) {
        message = (body as { error: string }).error;
      }
    } catch {
      // Non-JSON error body — keep the status fallback message.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** First two initials of a display name (e.g. "Emma Chen" → "EC"). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]!.toUpperCase());
  return letters.join('') || '?';
}

// Concurrent listUnits + getList (every dashboard mount fires both) share one
// request; the slot clears once settled so later calls always refetch fresh.
let inFlightListings: Promise<ListingsPayload> | null = null;

// Snapshot of the most recent listings payload — backs the synchronous
// firstUnitId() handle. Replaced wholesale on each fetch (never mutated).
let lastListingsSnapshot: ListingsPayload | null = null;

function fetchListings(): Promise<ListingsPayload> {
  if (!inFlightListings) {
    inFlightListings = fetchJson<ListingsPayload>('/api/crm/listings')
      .then((payload) => {
        lastListingsSnapshot = payload;
        return payload;
      })
      .finally(() => {
        inFlightListings = null;
      });
  }
  return inFlightListings;
}

const realClient: CrmClient = {
  listUnits: async () => {
    const { listings, viewer } = await fetchListings();
    return listings.map((row) => toCrmUnit(row, viewer.id));
  },
  // Collaboration is mock-only (no crm_lists backend) — synthesize the
  // single-member list from the session viewer so the header renders honestly.
  getList: async () => {
    const { viewer } = await fetchListings();
    return {
      id: `personal_${viewer.id}`,
      name: 'My Apartments',
      ownerId: viewer.id,
      members: [
        { id: viewer.id, name: viewer.name, initials: initialsOf(viewer.name), color: '#991b1b' },
      ],
    };
  },
  addListing: (sourceUrl) =>
    fetchJson<AddListingResult>('/api/crm/listings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceUrl }),
    }),
  getAnalysis: (id) =>
    fetchJson<FirstSaveAnalysis>(`/api/crm/listings/${encodeURIComponent(id)}/analysis`),
  rank: (mode) =>
    fetchJson<RankCompareResult>('/api/crm/rank', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode }),
    }),
  deleteUnit: (id) =>
    fetchJson<void>(`/api/crm/listings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  firstUnitId: () => {
    const first = lastListingsSnapshot?.listings[0];
    if (!first) {
      throw new Error('firstUnitId: no listings loaded yet — call listUnits() first');
    }
    return first.id;
  },
};

const USE_MOCK = process.env.NEXT_PUBLIC_CRM_MOCK !== 'false';

export const crmClient: CrmClient = USE_MOCK ? mockClient : realClient;
