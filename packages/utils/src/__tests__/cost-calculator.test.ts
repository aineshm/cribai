import { describe, it, expect } from 'vitest';
import { calculateTrueCost } from '../cost-calculator';

describe('calculateTrueCost', () => {
  it('returns base rent + all defaults when nothing included', () => {
    const result = calculateTrueCost({ rentMonthly: 1200 });
    expect(result.rent).toBe(1200);
    expect(result.utilities).toBe(150);
    expect(result.parking).toBe(75);
    expect(result.internet).toBe(60);
    expect(result.laundry).toBe(40);
    expect(result.renterInsurance).toBe(15);
    expect(result.moveInFees).toBe(0);
    expect(result.total).toBe(1540);
  });

  it('zeroes utilities when included', () => {
    const result = calculateTrueCost({ rentMonthly: 1200, utilitiesIncluded: true });
    expect(result.utilities).toBe(0);
    expect(result.total).toBe(1200 + 75 + 60 + 40 + 15);
  });

  it('zeroes parking when included', () => {
    const result = calculateTrueCost({ rentMonthly: 1200, parkingIncluded: true });
    expect(result.parking).toBe(0);
  });

  it('zeroes laundry when in-unit', () => {
    const result = calculateTrueCost({ rentMonthly: 1200, hasInUnitLaundry: true });
    expect(result.laundry).toBe(0);
  });

  it('uses campus averages over defaults', () => {
    const result = calculateTrueCost({
      rentMonthly: 1200,
      campusAvgUtilities: 200,
      campusAvgParking: 50,
    });
    expect(result.utilities).toBe(200);
    expect(result.parking).toBe(50);
  });

  it('uses explicit estimates over campus averages', () => {
    const result = calculateTrueCost({
      rentMonthly: 1200,
      campusAvgUtilities: 200,
      estimatedUtilities: 100,
    });
    expect(result.utilities).toBe(100);
  });

  it('amortizes move-in fees over lease length', () => {
    const result = calculateTrueCost({
      rentMonthly: 1200,
      moveInFees: 1200,
      leaseLengthMonths: 12,
    });
    expect(result.moveInFees).toBe(100);
  });

  it('handles zero lease length without error', () => {
    const result = calculateTrueCost({
      rentMonthly: 1200,
      moveInFees: 500,
      leaseLengthMonths: 0,
    });
    expect(result.moveInFees).toBe(0);
  });

  it('rounds total to 2 decimal places', () => {
    const result = calculateTrueCost({
      rentMonthly: 1199.99,
      moveInFees: 100,
      leaseLengthMonths: 3,
    });
    expect(result.total).toBe(
      Math.round((1199.99 + 150 + 75 + 60 + 40 + 15 + 100 / 3) * 100) / 100
    );
  });
});
