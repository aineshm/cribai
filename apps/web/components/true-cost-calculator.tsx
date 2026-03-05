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
    <div className="rounded-xl bg-white p-5 shadow-[var(--shadow-card)]">
      <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">True Cost Calculator</h3>
      <p className="mt-1 text-sm text-[var(--surface-400)]">
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

      <div className="mt-5 border-t border-[var(--surface-200)] pt-4 space-y-1">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={`flex justify-between text-sm py-1.5 px-2 rounded ${
              index % 2 === 0 ? 'bg-[var(--surface-50)]' : ''
            }`}
          >
            <span className="text-[var(--surface-600)]">{item.label}</span>
            <span className="text-[var(--surface-700)]">${item.value.toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-[var(--surface-200)] pt-2 mt-2 text-base font-bold px-2 py-1.5 rounded bg-[var(--primary-50)] text-[var(--primary-800)]">
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
    <label className="flex items-center gap-3 text-sm text-[var(--surface-700)] cursor-pointer">
      <span className="toggle-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
        />
        <span className="slider" />
      </span>
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
    <div className="ml-12">
      <input
        type="number"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--surface-200)] px-3 py-1.5 text-sm bg-white focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)] transition-colors"
        aria-label={label}
      />
    </div>
  );
}
