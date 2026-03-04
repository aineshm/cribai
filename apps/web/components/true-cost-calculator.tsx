'use client';

import { useState } from 'react';
import { calculateTrueCost, type TrueCostInput } from '@campusnest/utils';
import { useCampus } from '../lib/campus-context';

interface TrueCostCalculatorProps {
  readonly rentMonthly: number;
  readonly amenities: readonly string[];
}

export function TrueCostCalculator({
  rentMonthly,
  amenities,
}: TrueCostCalculatorProps) {
  const campus = useCampus();
  const avgUtilities = campus.config.avgUtilities;
  const avgParking = campus.config.avgParking;

  const [utilitiesIncluded, setUtilitiesIncluded] = useState(
    amenities.includes('utilities_included')
  );
  const [parkingIncluded, setParkingIncluded] = useState(
    amenities.includes('parking')
  );
  const [internetIncluded, setInternetIncluded] = useState(
    amenities.includes('internet')
  );
  const [hasInUnitLaundry, setHasInUnitLaundry] = useState(
    amenities.includes('in_unit_laundry')
  );
  const [customUtilities, setCustomUtilities] = useState('');
  const [customParking, setCustomParking] = useState('');
  const [renterInsurance, setRenterInsurance] = useState('');
  const [moveInFees, setMoveInFees] = useState('');

  const input: TrueCostInput = {
    rentMonthly,
    utilitiesIncluded,
    estimatedUtilities: customUtilities ? parseFloat(customUtilities) : undefined,
    campusAvgUtilities: avgUtilities,
    parkingIncluded,
    estimatedParking: customParking ? parseFloat(customParking) : undefined,
    campusAvgParking: avgParking,
    internetIncluded,
    hasInUnitLaundry,
    renterInsurance: renterInsurance ? parseFloat(renterInsurance) : undefined,
    moveInFees: moveInFees ? parseFloat(moveInFees) : undefined,
  };

  const cost = calculateTrueCost(input);

  const items = [
    { label: 'Rent', value: cost.rent },
    { label: 'Utilities', value: cost.utilities },
    { label: 'Parking', value: cost.parking },
    { label: 'Internet', value: cost.internet },
    { label: 'Laundry', value: cost.laundry },
    { label: 'Renter Insurance', value: cost.renterInsurance },
    { label: 'Move-in (amortized)', value: cost.moveInFees },
  ];

  return (
    <div className="rounded-lg border p-5">
      <h3 className="text-lg font-semibold">True Cost Calculator</h3>
      <p className="mt-1 text-sm text-gray-500">
        Toggle what&apos;s included to see your real monthly cost.
      </p>

      <div className="mt-4 space-y-3">
        <Toggle
          label="Utilities included"
          checked={utilitiesIncluded}
          onChange={setUtilitiesIncluded}
        />
        {!utilitiesIncluded && (
          <NumberInput
            label="Custom utilities estimate"
            placeholder={`Campus avg: $${avgUtilities ?? 150}`}
            value={customUtilities}
            onChange={setCustomUtilities}
          />
        )}

        <Toggle
          label="Parking included"
          checked={parkingIncluded}
          onChange={setParkingIncluded}
        />
        {!parkingIncluded && (
          <NumberInput
            label="Custom parking estimate"
            placeholder={`Campus avg: $${avgParking ?? 75}`}
            value={customParking}
            onChange={setCustomParking}
          />
        )}

        <Toggle
          label="Internet included"
          checked={internetIncluded}
          onChange={setInternetIncluded}
        />

        <Toggle
          label="In-unit laundry"
          checked={hasInUnitLaundry}
          onChange={setHasInUnitLaundry}
        />

        <NumberInput
          label="Renter insurance ($/mo)"
          placeholder="Default: $15"
          value={renterInsurance}
          onChange={setRenterInsurance}
        />

        <NumberInput
          label="Move-in fees (one-time)"
          placeholder="Default: $0"
          value={moveInFees}
          onChange={setMoveInFees}
        />
      </div>

      <div className="mt-5 border-t pt-4 space-y-1">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex justify-between text-sm text-gray-700"
          >
            <span>{item.label}</span>
            <span>${item.value.toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t pt-2 text-base font-bold text-gray-900">
          <span>Total</span>
          <span>${cost.total.toFixed(2)}/mo</span>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded"
      />
      {label}
    </label>
  );
}

function NumberInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
}) {
  return (
    <div className="ml-6">
      <input
        type="number"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border px-3 py-1.5 text-sm"
        aria-label={label}
      />
    </div>
  );
}
