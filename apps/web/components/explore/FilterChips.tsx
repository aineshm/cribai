'use client';

import { useCallback } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  const isActive = value !== null;
  const displayLabel = isActive && formatValue ? formatValue(value) : label;
  const menuValue = value === null ? 'any' : String(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={`shrink-0 gap-1.5 rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
              isActive
                ? 'border-red-800 bg-red-800 text-white hover:bg-red-900 hover:text-white'
                : 'border-[var(--surface-200)] bg-white text-[var(--surface-700)] hover:bg-[var(--surface-50)]'
            }`}
          >
            <Icon className="size-3.5" />
            {displayLabel}
            <ChevronDown className="size-3" />
          </Button>
        }
      />
      <DropdownMenuContent
        sideOffset={8}
        align="start"
        className="w-56 rounded-2xl border border-[var(--surface-200)] bg-white p-2 shadow-[0_18px_40px_rgba(0,0,0,0.08)]"
      >
        <DropdownMenuRadioGroup
          value={menuValue}
          onValueChange={(nextValue) => {
            const parsedValue = nextValue === 'any' ? null : Number(nextValue);
            onChange(Number.isNaN(parsedValue) ? null : parsedValue);
            trackEvent('filter_applied', {
              filter: label.toLowerCase(),
              value: String(parsedValue),
            });
          }}
        >
          {options.map((option) => {
            const optionValue = option.value === null ? 'any' : String(option.value);
            return (
              <DropdownMenuRadioItem
                key={option.label}
                value={optionValue}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--surface-700)] data-[highlighted]:bg-red-50 data-[highlighted]:text-red-900"
              >
                {option.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
