import { describe, it, expect } from 'vitest';
import {
  UNITS,
  ANALYSIS_FULL,
  ANALYSIS_PARTIAL,
  RANK_RESULT,
  COMPARE_RESULT,
  CRM_LIST,
  ADD_LISTING_RESULT,
} from '@/lib/crm/fixtures';

describe('fixtures', () => {
  it('has 6 unit-level rows, Chapter S1 first', () => {
    expect(UNITS).toHaveLength(6);
    const first = UNITS[0];
    expect(first).toBeDefined();
    expect(first?._proposed.unit.building).toMatch(/Chapter at Madison/i);
    expect(first?._proposed.unit.floorPlan).toBe('S1');
  });
  it('partial analysis has a skipped branch (no crash path)', () => {
    expect(ANALYSIS_PARTIAL.placesSnapshot.status).toBe('skipped');
    expect(ANALYSIS_FULL.placesSnapshot.status).toBe('ok');
  });
  it('rank/compare unions are well-formed', () => {
    expect(RANK_RESULT.mode).toBe('rank');
    expect(COMPARE_RESULT.mode).toBe('compare');
    expect(RANK_RESULT.mode === 'rank' && RANK_RESULT.ranked.length).toBeGreaterThan(0);
  });
  it('AddListingResult is contract-shaped', () => {
    expect(ADD_LISTING_RESULT).toMatchObject({
      listingId: expect.any(String),
      alreadySaved: expect.any(Boolean),
      confidence: expect.any(Number),
    });
  });
  it('list carries members', () => {
    expect(CRM_LIST.members.length).toBeGreaterThanOrEqual(2);
  });
});
