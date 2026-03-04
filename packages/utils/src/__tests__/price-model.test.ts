import { describe, it, expect } from 'vitest';
import { trainPriceModel, predictRent, type PriceModelFeatures } from '../price-model';

function makeFeatures(overrides?: Partial<PriceModelFeatures>): PriceModelFeatures {
  return {
    bedrooms: 2,
    bathrooms: 1,
    sqft: 800,
    distanceToCampusKm: 1.5,
    amenityCount: 3,
    hasParking: false,
    hasLaundry: false,
    hasAC: true,
    ...overrides,
  };
}

function makeTrainingData(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const bedrooms = 1 + (i % 4);
    const sqft = 400 + bedrooms * 200 + i * 10;
    const distance = 0.5 + (i % 5) * 0.5;
    const rent = 500 + bedrooms * 300 + sqft * 0.5 - distance * 100 + (i % 3) * 50;
    return {
      features: makeFeatures({
        bedrooms,
        bathrooms: Math.ceil(bedrooms / 2),
        sqft,
        distanceToCampusKm: distance,
        amenityCount: i % 6,
        hasParking: i % 2 === 0,
        hasLaundry: i % 3 === 0,
        hasAC: i % 2 === 1,
      }),
      rent,
    };
  });
}

describe('trainPriceModel', () => {
  it('returns fallback for < 5 samples', () => {
    const data = makeTrainingData(3);
    const model = trainPriceModel(data);
    expect(model.sampleSize).toBe(3);
    // Fallback: intercept is weighted average, weights empty
    expect(Object.keys(model.weights)).toHaveLength(0);
    expect(model.intercept).toBeGreaterThan(0);
  });

  it('coefficients are reasonable (bedrooms positive, distance negative)', () => {
    const data = makeTrainingData(30);
    const model = trainPriceModel(data);
    expect(model.weights['bedrooms']).toBeGreaterThan(0);
    expect(model.weights['distanceToCampusKm']).toBeLessThan(0);
  });

  it('R² is between 0 and 1', () => {
    const data = makeTrainingData(30);
    const model = trainPriceModel(data);
    expect(model.r2).toBeGreaterThanOrEqual(0);
    expect(model.r2).toBeLessThanOrEqual(1);
  });
});

describe('predictRent', () => {
  it('prediction is within range of training data', () => {
    const data = makeTrainingData(30);
    const model = trainPriceModel(data);
    const rents = data.map((d) => d.rent);
    const min = Math.min(...rents);
    const max = Math.max(...rents);
    const predicted = predictRent(makeFeatures(), model);
    // Allow some margin
    expect(predicted).toBeGreaterThan(min * 0.5);
    expect(predicted).toBeLessThan(max * 2);
  });

  it('more bedrooms → higher predicted rent', () => {
    const data = makeTrainingData(30);
    const model = trainPriceModel(data);
    const rent1 = predictRent(makeFeatures({ bedrooms: 1 }), model);
    const rent3 = predictRent(makeFeatures({ bedrooms: 3 }), model);
    expect(rent3).toBeGreaterThan(rent1);
  });

  it('closer to campus → higher predicted rent', () => {
    const data = makeTrainingData(30);
    const model = trainPriceModel(data);
    const rentClose = predictRent(makeFeatures({ distanceToCampusKm: 0.5 }), model);
    const rentFar = predictRent(makeFeatures({ distanceToCampusKm: 3.0 }), model);
    expect(rentClose).toBeGreaterThan(rentFar);
  });

  it('handles all-same values gracefully', () => {
    const data = Array.from({ length: 10 }, () => ({
      features: makeFeatures(),
      rent: 1000,
    }));
    const model = trainPriceModel(data);
    const predicted = predictRent(makeFeatures(), model);
    // Should fall back to average since no variance
    expect(predicted).toBeCloseTo(1000, 0);
  });
});
