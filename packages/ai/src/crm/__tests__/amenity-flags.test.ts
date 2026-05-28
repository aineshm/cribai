/**
 * Unit tests for crm/amenity-flags.ts — pure string matching, no I/O.
 */
import { describe, it, expect } from 'vitest';
import { amenitiesToCostFlags } from '../amenity-flags';

// ---------------------------------------------------------------------------
// null / undefined / empty inputs
// ---------------------------------------------------------------------------

describe('amenitiesToCostFlags — empty / null inputs', () => {
  it('returns {} for an empty array', () => {
    expect(amenitiesToCostFlags([])).toEqual({});
  });

  it('returns {} for null', () => {
    expect(amenitiesToCostFlags(null)).toEqual({});
  });

  it('returns {} for undefined', () => {
    expect(amenitiesToCostFlags(undefined)).toEqual({});
  });

  it('returns {} for an unrelated amenity', () => {
    expect(amenitiesToCostFlags(['balcony'])).toEqual({});
    expect(amenitiesToCostFlags(['rooftop deck', 'gym', 'pool'])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// In-unit laundry → hasInUnitLaundry
// ---------------------------------------------------------------------------

describe('amenitiesToCostFlags — laundry', () => {
  it('sets hasInUnitLaundry=true for "In-Unit Laundry"', () => {
    expect(amenitiesToCostFlags(['In-Unit Laundry'])).toEqual({ hasInUnitLaundry: true });
  });

  it('sets hasInUnitLaundry=true for lowercase "laundry in unit"', () => {
    expect(amenitiesToCostFlags(['laundry in unit'])).toEqual({ hasInUnitLaundry: true });
  });

  it('sets hasInUnitLaundry=true for "LAUNDRY HOOKUPS"', () => {
    expect(amenitiesToCostFlags(['LAUNDRY HOOKUPS'])).toEqual({ hasInUnitLaundry: true });
  });
});

// ---------------------------------------------------------------------------
// Parking → parkingIncluded
// ---------------------------------------------------------------------------

describe('amenitiesToCostFlags — parking', () => {
  it('sets parkingIncluded=true for "Parking"', () => {
    expect(amenitiesToCostFlags(['Parking'])).toEqual({ parkingIncluded: true });
  });

  it('sets parkingIncluded=true for "Off-Street Parking Included"', () => {
    expect(amenitiesToCostFlags(['Off-Street Parking Included'])).toEqual({ parkingIncluded: true });
  });

  it('sets parkingIncluded=true for "underground parking garage"', () => {
    expect(amenitiesToCostFlags(['underground parking garage'])).toEqual({ parkingIncluded: true });
  });
});

// ---------------------------------------------------------------------------
// Internet / wifi → internetIncluded
// ---------------------------------------------------------------------------

describe('amenitiesToCostFlags — internet / wifi', () => {
  it('sets internetIncluded=true for "wifi"', () => {
    expect(amenitiesToCostFlags(['wifi'])).toEqual({ internetIncluded: true });
  });

  it('sets internetIncluded=true for "WiFi"', () => {
    expect(amenitiesToCostFlags(['WiFi'])).toEqual({ internetIncluded: true });
  });

  it('sets internetIncluded=true for "high-speed internet"', () => {
    expect(amenitiesToCostFlags(['high-speed internet'])).toEqual({ internetIncluded: true });
  });

  it('sets internetIncluded=true for "Internet Included"', () => {
    expect(amenitiesToCostFlags(['Internet Included'])).toEqual({ internetIncluded: true });
  });

  it('both "wifi" and "high-speed internet" individually set the flag', () => {
    expect(amenitiesToCostFlags(['wifi'])).toEqual({ internetIncluded: true });
    expect(amenitiesToCostFlags(['high-speed internet'])).toEqual({ internetIncluded: true });
  });
});

// ---------------------------------------------------------------------------
// Utilities included → utilitiesIncluded
// ---------------------------------------------------------------------------

describe('amenitiesToCostFlags — utilities', () => {
  it('sets utilitiesIncluded=true for "Utilities Included"', () => {
    expect(amenitiesToCostFlags(['Utilities Included'])).toEqual({ utilitiesIncluded: true });
  });

  it('sets utilitiesIncluded=true for "Heat Included"', () => {
    expect(amenitiesToCostFlags(['Heat Included'])).toEqual({ utilitiesIncluded: true });
  });

  it('sets utilitiesIncluded=true for "water included"', () => {
    expect(amenitiesToCostFlags(['water included'])).toEqual({ utilitiesIncluded: true });
  });

  it('multiple utility strings still set utilitiesIncluded exactly once (not duplicated)', () => {
    const result = amenitiesToCostFlags(['utilities included', 'heat included', 'water included']);
    expect(result).toEqual({ utilitiesIncluded: true });
    // key appears only once (plain object — no dup issue, but verifying shape)
    expect(Object.keys(result).filter((k) => k === 'utilitiesIncluded').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Combined / multi-flag
// ---------------------------------------------------------------------------

describe('amenitiesToCostFlags — multiple flags', () => {
  it('combines all four flags from a representative set', () => {
    const amenities = [
      'In-Unit Laundry',
      'Off-Street Parking',
      'WiFi',
      'Utilities Included',
    ];
    expect(amenitiesToCostFlags(amenities)).toEqual({
      hasInUnitLaundry: true,
      parkingIncluded: true,
      internetIncluded: true,
      utilitiesIncluded: true,
    });
  });

  it('ignores unrecognised amenities while still setting known ones', () => {
    const amenities = ['balcony', 'gym', 'parking', 'rooftop'];
    expect(amenitiesToCostFlags(amenities)).toEqual({ parkingIncluded: true });
  });
});

// ---------------------------------------------------------------------------
// Immutability — input array must not be mutated
// ---------------------------------------------------------------------------

describe('amenitiesToCostFlags — immutability', () => {
  it('does not mutate the input array', () => {
    const input: string[] = ['laundry', 'wifi'];
    const before = [...input];
    amenitiesToCostFlags(input);
    expect(input).toEqual(before);
  });
});
