import type { TrueCost } from '@campusnest/types';

export interface TrueCostInput {
  readonly rentMonthly: number;
  readonly utilitiesIncluded?: boolean;
  readonly estimatedUtilities?: number;
  readonly campusAvgUtilities?: number;
  readonly parkingIncluded?: boolean;
  readonly estimatedParking?: number;
  readonly campusAvgParking?: number;
  readonly internetIncluded?: boolean;
  readonly estimatedInternet?: number;
  readonly hasInUnitLaundry?: boolean;
  readonly estimatedLaundry?: number;
  readonly renterInsurance?: number;
  readonly moveInFees?: number;
  readonly leaseLengthMonths?: number;
}

const DEFAULTS = {
  utilities: 150,
  parking: 75,
  internet: 60,
  laundry: 40,
  renterInsurance: 15,
  moveInFees: 0,
  leaseLengthMonths: 12,
} as const;

export function calculateTrueCost(input: TrueCostInput): TrueCost {
  const utilities = input.utilitiesIncluded
    ? 0
    : (input.estimatedUtilities ?? input.campusAvgUtilities ?? DEFAULTS.utilities);

  const parking = input.parkingIncluded
    ? 0
    : (input.estimatedParking ?? input.campusAvgParking ?? DEFAULTS.parking);

  const internet = input.internetIncluded
    ? 0
    : (input.estimatedInternet ?? DEFAULTS.internet);

  const laundry = input.hasInUnitLaundry
    ? 0
    : (input.estimatedLaundry ?? DEFAULTS.laundry);

  const renterInsurance = input.renterInsurance ?? DEFAULTS.renterInsurance;

  const leaseLengthMonths = input.leaseLengthMonths ?? DEFAULTS.leaseLengthMonths;
  const moveInFees = input.moveInFees ?? DEFAULTS.moveInFees;
  const moveInAmortized = leaseLengthMonths > 0
    ? moveInFees / leaseLengthMonths
    : 0;

  const total = input.rentMonthly + utilities + parking + internet + laundry + renterInsurance + moveInAmortized;

  return {
    rent: input.rentMonthly,
    utilities,
    parking,
    internet,
    laundry,
    renterInsurance,
    moveInFees: Math.round(moveInAmortized * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}
