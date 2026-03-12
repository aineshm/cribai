import { describe, it, expect } from 'vitest';
import { normalizeScore, scoreComposite, rankAndScore } from '../steps/04-rank';
import type { ResearchedListing } from '@campusnest/types';

function makeListing(overrides: Partial<ResearchedListing> = {}): ResearchedListing {
  return {
    id: crypto.randomUUID(),
    address: '123 Test St',
    rentMonthly: 1000,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 800,
    amenities: [],
    photoUrls: [],
    fairnessScore: null,
    reviewRating: null,
    reviewSnippet: null,
    walkScore: null,
    preferenceScore: null,
    ...overrides,
  };
}

describe('normalizeScore', () => {
  describe('fairness (1-10 → 0-1)', () => {
    it('maps 10 → 1.0', () => expect(normalizeScore('fairness', 10)).toBe(1.0));
    it('maps 1 → 0.0', () => expect(normalizeScore('fairness', 1)).toBe(0.0));
    it('maps 5.5 → ~0.5', () => expect(normalizeScore('fairness', 5.5)).toBeCloseTo(0.5));
    it('maps null → 0.5 (neutral)', () => expect(normalizeScore('fairness', null)).toBe(0.5));
  });

  describe('reviews (1-5 → 0-1)', () => {
    it('maps 5 → 1.0', () => expect(normalizeScore('reviews', 5)).toBe(1.0));
    it('maps 1 → 0.0', () => expect(normalizeScore('reviews', 1)).toBe(0.0));
    it('maps null → 0.5', () => expect(normalizeScore('reviews', null)).toBe(0.5));
  });

  describe('walkability (0-100 → 0-1)', () => {
    it('maps 100 → 1.0', () => expect(normalizeScore('walkability', 100)).toBe(1.0));
    it('maps 0 → 0.0', () => expect(normalizeScore('walkability', 0)).toBe(0.0));
    it('maps null → 0.5', () => expect(normalizeScore('walkability', null)).toBe(0.5));
  });

  describe('preference (0-10 → 0-1)', () => {
    it('maps 10 → 1.0', () => expect(normalizeScore('preference', 10)).toBe(1.0));
    it('maps 0 → 0.0', () => expect(normalizeScore('preference', 0)).toBe(0.0));
    it('maps null → 0.5', () => expect(normalizeScore('preference', null)).toBe(0.5));
  });
});

describe('scoreComposite', () => {
  it('returns 1.0 when all dimensions are at maximum', () => {
    expect(
      scoreComposite({ fairness: 10, reviews: 5, walkability: 100, preference: 10 }),
    ).toBe(1.0);
  });

  it('returns 0.5 when all dimensions are null (all neutral)', () => {
    expect(
      scoreComposite({ fairness: null, reviews: null, walkability: null, preference: null }),
    ).toBe(0.5);
  });

  it('scores above 0.5 when fairness is max and rest are null', () => {
    const score = scoreComposite({ fairness: 10, reviews: null, walkability: null, preference: null });
    // 0.30*1.0 + 0.25*0.5 + 0.20*0.5 + 0.25*0.5 = 0.30 + 0.125 + 0.10 + 0.125 = 0.65
    expect(score).toBeCloseTo(0.65);
  });

  it('returns 0.0 when all dimensions are at minimum', () => {
    expect(
      scoreComposite({ fairness: 1, reviews: 1, walkability: 0, preference: 0 }),
    ).toBe(0.0);
  });
});

describe('rankAndScore', () => {
  it('sorts listings descending by composite score', () => {
    const listings = [
      makeListing({ id: 'a', fairnessScore: 2 }),  // low score
      makeListing({ id: 'b', fairnessScore: 9 }),  // high score
      makeListing({ id: 'c', fairnessScore: 5 }),  // mid score
    ];
    const result = rankAndScore(listings, [null, null, null]);
    expect(result[0]!.id).toBe('b');
    expect(result[1]!.id).toBe('c');
    expect(result[2]!.id).toBe('a');
  });

  it('applies preferenceScores to the output', () => {
    const listings = [makeListing({ id: 'x' })];
    const result = rankAndScore(listings, [8]);
    expect(result[0]!.preferenceScore).toBe(8);
  });

  it('handles an empty listings array', () => {
    expect(rankAndScore([], [])).toEqual([]);
  });
});
