import { describe, it, expect } from 'vitest';
import { calculateFairnessScore } from '../fairness-scorer';

const makeComparable = (rent: number) => ({
  rentMonthly: rent,
  bedrooms: 1,
  sqft: 500,
  amenities: [] as string[],
});

describe('calculateFairnessScore', () => {
  it('returns null when fewer than 3 comparables', () => {
    const result = calculateFairnessScore({
      targetRent: 1200,
      targetBedrooms: 1,
      comparables: [makeComparable(1100), makeComparable(1300)],
    });
    expect(result).toBeNull();
  });

  it('returns high percentile for below-average rent', () => {
    const result = calculateFairnessScore({
      targetRent: 900,
      targetBedrooms: 1,
      comparables: [
        makeComparable(1000),
        makeComparable(1100),
        makeComparable(1200),
        makeComparable(1300),
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.percentile).toBe(100);
    expect(result!.delta).toBeLessThan(0);
  });

  it('returns low percentile for above-average rent', () => {
    const result = calculateFairnessScore({
      targetRent: 2000,
      targetBedrooms: 1,
      comparables: [
        makeComparable(1000),
        makeComparable(1100),
        makeComparable(1200),
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.percentile).toBe(0);
    expect(result!.delta).toBeGreaterThan(0);
  });

  it('calculates correct mean as predicted rent', () => {
    const result = calculateFairnessScore({
      targetRent: 1100,
      targetBedrooms: 1,
      comparables: [
        makeComparable(1000),
        makeComparable(1100),
        makeComparable(1200),
      ],
    });
    expect(result!.predictedRent).toBe(1100);
  });

  it('score is between 1 and 10', () => {
    const result = calculateFairnessScore({
      targetRent: 1100,
      targetBedrooms: 1,
      comparables: [
        makeComparable(1000),
        makeComparable(1100),
        makeComparable(1200),
        makeComparable(1300),
        makeComparable(1400),
      ],
    });
    expect(result!.breakdown!['score']).toBeGreaterThanOrEqual(1);
    expect(result!.breakdown!['score']).toBeLessThanOrEqual(10);
  });

  it('includes breakdown with min/max/median/mean', () => {
    const result = calculateFairnessScore({
      targetRent: 1100,
      targetBedrooms: 1,
      comparables: [
        makeComparable(1000),
        makeComparable(1200),
        makeComparable(1400),
      ],
    });
    expect(result!.breakdown).toMatchObject({
      min: 1000,
      max: 1400,
      median: 1200,
    });
  });
});
