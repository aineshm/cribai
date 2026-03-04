import type { FairnessData } from '@campusnest/types';

export interface ComparableListing {
  readonly rentMonthly: number;
  readonly bedrooms: number | null;
  readonly sqft: number | null;
  readonly amenities: readonly string[];
}

export interface FairnessInput {
  readonly targetRent: number;
  readonly targetBedrooms: number | null;
  readonly comparables: readonly ComparableListing[];
}

export function calculateFairnessScore(input: FairnessInput): FairnessData | null {
  const { targetRent, comparables } = input;

  if (comparables.length < 3) {
    return null;
  }

  const rents = comparables.map((c) => c.rentMonthly);
  const sortedRents = [...rents].sort((a, b) => a - b);
  const mean = rents.reduce((sum, r) => sum + r, 0) / rents.length;

  // Percentile: what fraction of comparables cost more than this listing
  const cheaperCount = sortedRents.filter((r) => r > targetRent).length;
  const percentile = Math.round((cheaperCount / sortedRents.length) * 100);

  // Delta from predicted (mean of comparables)
  const delta = targetRent - mean;
  const deltaPercent = mean > 0 ? (delta / mean) * 100 : 0;

  // Score: 1 (worst value) to 10 (best value)
  // Based on percentile — higher percentile = more listings cost more = better value
  const rawScore = 1 + (percentile / 100) * 9;
  const score = Math.round(Math.min(10, Math.max(1, rawScore)) * 10) / 10;

  return {
    comparableCount: comparables.length,
    percentile,
    predictedRent: Math.round(mean * 100) / 100,
    delta: Math.round(deltaPercent * 100) / 100,
    breakdown: {
      mean: Math.round(mean * 100) / 100,
      median: sortedRents[Math.floor(sortedRents.length / 2)] ?? 0,
      min: sortedRents[0] ?? 0,
      max: sortedRents[sortedRents.length - 1] ?? 0,
      score,
    },
  };
}
