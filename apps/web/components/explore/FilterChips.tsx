'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign,
  Bed,
  PawPrint,
  Sofa,
  Repeat,
  X,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { springConfig } from '@/lib/animations';
import { trackEvent } from '@/lib/track-event';
import type { FilterValues } from '@/lib/filter-listings';
import { activeFilterCount } from '@/lib/filter-listings';

/* ------------------------------------------------------------------ */
/* Price options                                                       */
/* ------------------------------------------------------------------ */
const PRICE_OPTIONS = [
  { label: 'Any', value: null },
  { label: 'Under $800', value: 800 },
  { label: 'Under $1,000', value: 1000 },
  { label: 'Under $1,200', value: 1200 },
  { label: 'Under $1,500', value: 1500 },
  { label: 'Under $2,000', value: 2000 },
] as const;

/* ------------------------------------------------------------------ */
/* Beds options                                                        */
/* ------------------------------------------------------------------ */
const BEDS_OPTIONS = [
  { label: 'Any', value: null },
  { label: 'Studio', value: 0 },
  { label: '1+', value: 1 },
  { label: '2+', value: 2 },
  { label: '3+', value: 3 },
  { label: '4+', value: 4 },
] as const;

/* ------------------------------------------------------------------ */
/* Dropdown component                                                  */
/* ------------------------------------------------------------------ */
interface DropdownFilterProps {
  readonly label: string;
  readonly icon: React.ElementType;
  readonly options: readonly { readonly label: string; readonly value: number | null }[];
  readonly value: number | null;
  readonly onChange: (value: number | null) => void;
  readonly formatValue?: (value: number | null) => string;
}

function DropdownFilter({ label, icon: Icon, options, value, onChange, formatValue }: DropdownFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const isActive = value !== null;
  const displayLabel = isActive && formatValue ? formatValue(value) : label;

  return (
    <div ref={ref} className="relative">
      <Button
        variant={isActive ? 'default' : 'outline'}
        size="sm"
        className={`shrink-0 gap-1.5 rounded-full ${
          isActive ? 'bg-[var(--primary-700)] text-white hover:bg-[var(--primary-800)]' : ''
        }`}
        onClick={() => setOpen(!open)}
      >
        <Icon className="size-3.5" />
        {displayLabel}
        <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 z-50 mt-1 min-w-[160px] rounded-lg border border-[var(--surface-200)] bg-white shadow-lg py-1"
          >
            {options.map((option) => (
              <button
                key={option.label}
                type="button"
                className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-50)] transition-colors ${
                  value === option.value
                    ? 'text-[var(--primary-700)] font-medium bg-[var(--primary-50)]'
                    : 'text-[var(--surface-700)]'
                }`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  trackEvent('filter_applied', { filter: label.toLowerCase(), value: String(option.value) });
                }}
              >
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle chip component                                               */
/* ------------------------------------------------------------------ */
interface ToggleChipProps {
  readonly label: string;
  readonly icon: React.ElementType;
  readonly active: boolean;
  readonly onToggle: () => void;
}

function ToggleChip({ label, icon: Icon, active, onToggle }: ToggleChipProps) {
  return (
    <motion.div layout transition={springConfig.snappy}>
      <Button
        variant={active ? 'default' : 'outline'}
        size="sm"
        className={`shrink-0 gap-1.5 rounded-full ${
          active ? 'bg-[var(--primary-700)] text-white hover:bg-[var(--primary-800)]' : ''
        }`}
        aria-pressed={active}
        onClick={onToggle}
      >
        <Icon className="size-3.5" />
        {label}
        <AnimatePresence>
          {active && (
            <motion.span
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={springConfig.snappy}
            >
              <X className="size-3" />
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Main FilterChips component                                          */
/* ------------------------------------------------------------------ */
interface FilterChipsProps {
  readonly resultCount: number;
  readonly campusName?: string;
  readonly filters: FilterValues;
  readonly onFiltersChange: (filters: FilterValues) => void;
}

export function FilterChips({
  resultCount,
  campusName = 'UW-Madison',
  filters,
  onFiltersChange,
}: FilterChipsProps) {
  const updateFilter = useCallback(
    <K extends keyof FilterValues>(key: K, value: FilterValues[K]) => {
      onFiltersChange({ ...filters, [key]: value });
    },
    [filters, onFiltersChange],
  );

  const count = activeFilterCount(filters);

  return (
    <div className="space-y-3">
      {/* Scrollable filter row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <ToggleChip
          label="Subleases"
          icon={Repeat}
          active={filters.sublease}
          onToggle={() => updateFilter('sublease', !filters.sublease)}
        />
        <DropdownFilter
          label="Price"
          icon={DollarSign}
          options={PRICE_OPTIONS}
          value={filters.priceMax}
          onChange={(v) => updateFilter('priceMax', v)}
          formatValue={(v) => v !== null ? `Under $${v.toLocaleString()}` : 'Price'}
        />
        <DropdownFilter
          label="Beds"
          icon={Bed}
          options={BEDS_OPTIONS}
          value={filters.bedsMin}
          onChange={(v) => updateFilter('bedsMin', v)}
          formatValue={(v) => {
            if (v === null) return 'Beds';
            if (v === 0) return 'Studio';
            return `${v}+ Beds`;
          }}
        />
        <ToggleChip
          label="Pet Friendly"
          icon={PawPrint}
          active={filters.petFriendly}
          onToggle={() => updateFilter('petFriendly', !filters.petFriendly)}
        />
        <ToggleChip
          label="Furnished"
          icon={Sofa}
          active={filters.furnished}
          onToggle={() => updateFilter('furnished', !filters.furnished)}
        />

        {/* Clear all button */}
        {count > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1 rounded-full text-[var(--surface-500)] hover:text-[var(--surface-700)]"
              onClick={() => onFiltersChange({
                sublease: false,
                priceMax: null,
                bedsMin: null,
                petFriendly: false,
                furnished: false,
              })}
            >
              <X className="size-3" />
              Clear ({count})
            </Button>
          </motion.div>
        )}
      </div>

      {/* Result count */}
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{resultCount}</span>{' '}
        apartments near {campusName}
      </p>
    </div>
  );
}
