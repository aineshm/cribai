import type { FairnessData } from '@campusnest/types';
import { selectComparables, type ComparableCandidate } from './comparable-selector';
import { trainPriceModel, predictRent, type PriceModelFeatures } from './price-model';

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

export interface EnhancedFairnessInput {
  readonly target: ComparableCandidate & { rentMonthly: number };
  readonly allListings: readonly ComparableCandidate[];
  readonly campusLocation?: { latitude: number; longitude: number };
}

function candidateToFeatures(
  c: ComparableCandidate,
  campusLat: number,
  campusLng: number,
): PriceModelFeatures {
  const amenities = c.amenities.map((a) => a.toLowerCase());
  // Rough distance using haversine inline
  let distanceToCampusKm = 2;
  if (c.latitude !== null && c.longitude !== null) {
    const R = 6371;
    const dLat = ((campusLat - c.latitude) * Math.PI) / 180;
    const dLng = ((campusLng - c.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((c.latitude * Math.PI) / 180) *
        Math.cos((campusLat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    distanceToCampusKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  return {
    bedrooms: c.bedrooms ?? 1,
    bathrooms: c.bathrooms ?? 1,
    sqft: c.sqft ?? 600,
    distanceToCampusKm,
    amenityCount: amenities.length,
    hasParking: amenities.some((a) => a.includes('parking')),
    hasLaundry: amenities.some((a) => a.includes('laundry')),
    hasAC: amenities.some((a) => a.includes('ac') || a.includes('air conditioning')),
  };
}

export function calculateEnhancedFairness(input: EnhancedFairnessInput): FairnessData | null {
  const { target, allListings, campusLocation } = input;

  // Find comparables
  const comparables = selectComparables(target, allListings);

  // Fall back to simple percentile method if < 5 comparables
  if (comparables.length < 5) {
    return calculateFairnessScore({
      targetRent: target.rentMonthly,
      targetBedrooms: target.bedrooms,
      comparables: comparables.map((c) => ({
        rentMonthly: c.rentMonthly,
        bedrooms: c.bedrooms,
        sqft: c.sqft,
        amenities: c.amenities,
      })),
    });
  }

  const campusLat = campusLocation?.latitude ?? target.latitude ?? 0;
  const campusLng = campusLocation?.longitude ?? target.longitude ?? 0;

  // Train model on comparables
  const trainingData = comparables.map((c) => ({
    features: candidateToFeatures(c, campusLat, campusLng),
    rent: c.rentMonthly,
  }));
  const model = trainPriceModel(trainingData);

  // Predict rent for target
  const targetFeatures = candidateToFeatures(target, campusLat, campusLng);
  const predicted = predictRent(targetFeatures, model);

  // Score: how target compares to predicted
  const delta = target.rentMonthly - predicted;
  const deltaPercent = predicted > 0 ? (delta / predicted) * 100 : 0;

  // Score 1–10: if rent < predicted → good value (high score), if rent > predicted → poor value
  // deltaPercent of -20% means 20% below predicted = great deal
  const rawScore = 5.5 - deltaPercent / 10;
  const score = Math.round(Math.min(10, Math.max(1, rawScore)) * 10) / 10;

  const rents = comparables.map((c) => c.rentMonthly);
  const sortedRents = [...rents].sort((a, b) => a - b);
  const cheaperCount = sortedRents.filter((r) => r > target.rentMonthly).length;
  const percentile = Math.round((cheaperCount / sortedRents.length) * 100);

  return {
    comparableCount: comparables.length,
    percentile,
    predictedRent: Math.round(predicted * 100) / 100,
    delta: Math.round(deltaPercent * 100) / 100,
    breakdown: {
      mean: Math.round((rents.reduce((s, r) => s + r, 0) / rents.length) * 100) / 100,
      median: sortedRents[Math.floor(sortedRents.length / 2)] ?? 0,
      min: sortedRents[0] ?? 0,
      max: sortedRents[sortedRents.length - 1] ?? 0,
      score,
    },
  };
}
