import { describe, expect, it } from 'vitest';
import { checkGrounding } from '../grounding';
import type { LiveSseEvent } from '../../http-turn';
import { SEED_LISTINGS } from '../../seed-truth';

const TRUTH = SEED_LISTINGS.twobed_basic; // rent 1650, bedrooms 2, bathrooms 1, sqft 900
const DB_ID = 'db-id-twobed-basic';
const TRUTH_MAP = new Map([[DB_ID, TRUTH]]);
const UNKNOWN_ID = 'db-id-unknown';

function rankResultEvent(ranked: { listingId: string }[]): LiveSseEvent {
  return {
    type: 'tool_result',
    name: 'rank_compare',
    block: { type: 'text', content: 'ok' } as never,
    machineData: {
      kind: 'rank_compare',
      result: { mode: 'rank', ranked: ranked.map((r) => ({ ...r, title: 't', score: 80, breakdown: {} })) },
      show_card: true,
    } as never,
  };
}

function compareResultEvent(rows: Array<Record<string, unknown>>): LiveSseEvent {
  return {
    type: 'tool_result',
    name: 'rank_compare',
    block: { type: 'text', content: 'ok' } as never,
    machineData: { kind: 'rank_compare', result: { mode: 'compare', rows }, show_card: true } as never,
  };
}

describe('checkGrounding — mode: none', () => {
  it('vacuously passes regardless of events', () => {
    expect(checkGrounding({ events: [], mode: 'none', truthByListingId: TRUTH_MAP }).pass).toBe(true);
  });
});

describe('checkGrounding — mode: ranked_ids', () => {
  it('passes when every ranked id is known', () => {
    const events = [rankResultEvent([{ listingId: DB_ID }])];
    expect(checkGrounding({ events, mode: 'ranked_ids', truthByListingId: TRUTH_MAP }).pass).toBe(true);
  });

  it('fails when a ranked id is unknown (fabricated)', () => {
    const events = [rankResultEvent([{ listingId: UNKNOWN_ID }])];
    const result = checkGrounding({ events, mode: 'ranked_ids', truthByListingId: TRUTH_MAP });
    expect(result.pass).toBe(false);
    expect(result.detail).toContain(UNKNOWN_ID);
  });

  it('fails when grounding is expected but no machineData was emitted', () => {
    const result = checkGrounding({ events: [], mode: 'ranked_ids', truthByListingId: TRUTH_MAP });
    expect(result.pass).toBe(false);
  });
});

describe('checkGrounding — mode: listing_fields', () => {
  it('passes when every numeric field matches truth exactly', () => {
    const events = [
      compareResultEvent([
        {
          listingId: DB_ID,
          title: 't',
          rent: TRUTH.rent,
          bedrooms: TRUTH.bedrooms,
          bathrooms: TRUTH.bathrooms,
          sqft: TRUTH.sqft,
          amenities: [],
        },
      ]),
    ];
    expect(checkGrounding({ events, mode: 'listing_fields', truthByListingId: TRUTH_MAP }).pass).toBe(true);
  });

  it('fails on any numeric drift (rent mismatch)', () => {
    const events = [
      compareResultEvent([
        {
          listingId: DB_ID,
          title: 't',
          rent: TRUTH.rent! + 500,
          bedrooms: TRUTH.bedrooms,
          bathrooms: TRUTH.bathrooms,
          sqft: TRUTH.sqft,
          amenities: [],
        },
      ]),
    ];
    const result = checkGrounding({ events, mode: 'listing_fields', truthByListingId: TRUTH_MAP });
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/rent/);
  });

  it('skips (does not fail) an add_listing row with no truth match — a legitimately new row', () => {
    const events: LiveSseEvent[] = [
      {
        type: 'tool_result',
        name: 'add_listing',
        block: { type: 'text', content: 'saved' } as never,
        machineData: {
          kind: 'add_listing',
          result: { alreadySaved: false } as never,
          listing: { id: 'brand-new-id', rent: 1234, bedrooms: 1, bathrooms: 1, sqft: 500 } as never,
          show_card: true,
        } as never,
      },
    ];
    const result = checkGrounding({ events, mode: 'listing_fields', truthByListingId: TRUTH_MAP });
    expect(result.pass).toBe(true);
  });

  it('still fails a rank_compare row with an unknown id under listing_fields', () => {
    const events = [
      compareResultEvent([
        { listingId: UNKNOWN_ID, title: 't', rent: 1, bedrooms: 1, bathrooms: 1, sqft: 1, amenities: [] },
      ]),
    ];
    const result = checkGrounding({ events, mode: 'listing_fields', truthByListingId: TRUTH_MAP });
    expect(result.pass).toBe(false);
  });

  it('passes a rank-shape (id-only) record with a valid known id — no field diff against null (CodeRabbit PR #123 fix 1)', () => {
    // A `rank_compare` result in `mode: 'rank'` carries only `listingId` + a
    // computed score — no rent/bedrooms/bathrooms/sqft at all. Reaching this
    // record under `listing_fields` mode must NOT diff its (absent) numeric
    // fields against truth — that would false-fail every field against null
    // even though the id itself is perfectly valid.
    const events = [rankResultEvent([{ listingId: DB_ID }])];
    const result = checkGrounding({ events, mode: 'listing_fields', truthByListingId: TRUTH_MAP });
    expect(result.pass).toBe(true);
  });
});
