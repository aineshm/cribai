'use client';

import { useMemo } from 'react';
import { DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { calculateTrueCost } from '@campusnest/utils';
import { staggerItem } from '@/lib/animations';
import type { FairnessData } from '@/lib/listing-types';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface TrueCostSectionProps {
  /** Listed rent */
  readonly price: number;
  /** Amenity strings (used to infer what's included) */
  readonly amenities: readonly string[];
  /** DB-stored true cost total (used when available, otherwise computed) */
  readonly trueCostTotal: number | null;
  /** Fairness score (1-10) from breakdown or column */
  readonly fairnessScore: number | null;
  /** Full fairness comparison data */
  readonly fairnessData: FairnessData | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TrueCostSection({
  price,
  amenities,
  trueCostTotal,
  fairnessScore,
  fairnessData,
}: TrueCostSectionProps) {
  // Compute true cost client-side from amenity hints
  const trueCost = useMemo(() => {
    const lower = amenities.map((a) => a.toLowerCase());
    const hasParking = lower.some((a) => a.includes('parking'));
    const hasLaundry = lower.some(
      (a) => a.includes('laundry') || a.includes('washer'),
    );
    return calculateTrueCost({
      rentMonthly: price,
      parkingIncluded: hasParking,
      hasInUnitLaundry: hasLaundry,
    });
  }, [price, amenities]);

  // Prefer DB-stored total; fall back to client-computed
  const total = trueCostTotal ?? trueCost.total;

  return (
    <motion.div
      className="space-y-4 rounded-[1.75rem] border border-[var(--surface-200)] bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.04)]"
      variants={staggerItem}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground">
          Estimated True Monthly Cost
        </h2>
        {fairnessScore !== null && <FairnessScoreBadge score={fairnessScore} />}
      </div>

      {/* Line items */}
      <div className="space-y-2 text-sm">
        <CostLineItem label="Listed Rent" amount={trueCost.rent} bold />
        {trueCost.utilities > 0 && (
          <CostLineItem label="Utilities (est.)" amount={trueCost.utilities} />
        )}
        {trueCost.parking > 0 && (
          <CostLineItem label="Parking (est.)" amount={trueCost.parking} />
        )}
        {trueCost.internet > 0 && (
          <CostLineItem label="Internet (est.)" amount={trueCost.internet} />
        )}
        {trueCost.laundry > 0 && (
          <CostLineItem label="Laundry (est.)" amount={trueCost.laundry} />
        )}
        {trueCost.renterInsurance > 0 && (
          <CostLineItem
            label="Renter Insurance (est.)"
            amount={trueCost.renterInsurance}
          />
        )}
        {trueCost.moveInFees > 0 && (
          <CostLineItem
            label="Move-in Fees (amortized)"
            amount={trueCost.moveInFees}
          />
        )}
        <div className="border-t border-[var(--surface-200)] pt-2">
          <CostLineItem label="True Monthly Cost" amount={total} bold />
        </div>
      </div>

      {/* Fairness context */}
      {fairnessData && <FairnessContext data={fairnessData} />}

      <p className="text-xs text-muted-foreground/70">
        Estimates based on UW-Madison area averages. Included amenities reduce
        costs.
      </p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function CostLineItem({
  label,
  amount,
  bold = false,
}: {
  readonly label: string;
  readonly amount: number;
  readonly bold?: boolean;
}) {
  const cls = bold ? 'font-semibold text-foreground' : 'text-muted-foreground';
  return (
    <div className={`flex items-center justify-between ${cls}`}>
      <span>{label}</span>
      <span>${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
    </div>
  );
}

function FairnessScoreBadge({ score }: { readonly score: number }) {
  const bg =
    score >= 8
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : score >= 6
        ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
        : score >= 4
          ? 'bg-orange-50 border-orange-200 text-orange-800'
          : 'bg-red-50 border-red-200 text-red-800';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${bg}`}
    >
      <DollarSign className="size-3" />
      Value: {score}/10
    </span>
  );
}

function FairnessContext({ data }: { readonly data: FairnessData }) {
  if (data.delta < 0) {
    return (
      <div className="rounded-xl bg-[var(--surface-50)] p-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <TrendingDown className="size-4 text-emerald-600 shrink-0" />
          <span>
            <span className="font-medium text-emerald-700">
              {Math.abs(data.delta).toFixed(0)}% below
            </span>{' '}
            predicted rent (${data.predictedRent.toLocaleString()}/mo) based on{' '}
            {data.comparableCount} similar units
          </span>
        </span>
      </div>
    );
  }

  if (data.delta > 0) {
    return (
      <div className="rounded-xl bg-[var(--surface-50)] p-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <TrendingUp className="size-4 text-amber-600 shrink-0" />
          <span>
            <span className="font-medium text-amber-700">
              {data.delta.toFixed(0)}% above
            </span>{' '}
            predicted rent (${data.predictedRent.toLocaleString()}/mo) based on{' '}
            {data.comparableCount} similar units
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[var(--surface-50)] p-3 text-sm text-muted-foreground">
      Priced at predicted rent (${data.predictedRent.toLocaleString()}/mo) based
      on {data.comparableCount} similar units
    </div>
  );
}
