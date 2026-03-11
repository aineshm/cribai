'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useRef, useEffect, useState } from 'react';
import { X } from 'lucide-react';

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function ListingFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') ?? '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') ?? '');

  const debouncedMin = useDebounce(minPrice, 400);
  const debouncedMax = useDebounce(maxPrice, 400);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  // Sync debounced price values to URL
  const prevMinRef = useRef(debouncedMin);
  const prevMaxRef = useRef(debouncedMax);

  useEffect(() => {
    if (debouncedMin !== prevMinRef.current) {
      prevMinRef.current = debouncedMin;
      updateParam('minPrice', debouncedMin);
    }
  }, [debouncedMin, updateParam]);

  useEffect(() => {
    if (debouncedMax !== prevMaxRef.current) {
      prevMaxRef.current = debouncedMax;
      updateParam('maxPrice', debouncedMax);
    }
  }, [debouncedMax, updateParam]);

  const hasActiveFilters =
    searchParams.has('beds') ||
    searchParams.has('minPrice') ||
    searchParams.has('maxPrice') ||
    searchParams.has('sort');

  const activeCount = [
    searchParams.get('beds'),
    searchParams.get('minPrice'),
    searchParams.get('maxPrice'),
    searchParams.get('sort'),
  ].filter(Boolean).length;

  const clearAll = useCallback(() => {
    setMinPrice('');
    setMaxPrice('');
    router.push(pathname);
  }, [router, pathname]);

  const baseInputClass =
    'rounded-xl border bg-white px-3 py-2 text-sm text-[var(--surface-700)] focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)] transition-colors';

  const activeClass = 'border-[var(--primary-400)] bg-[var(--primary-50)]';
  const inactiveClass = 'border-[var(--surface-200)]';

  return (
    <div className="rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-3">
        <select
          data-testid="beds-filter"
          aria-label="Number of bedrooms"
          value={searchParams.get('beds') ?? ''}
          onChange={(e) => updateParam('beds', e.target.value)}
          className={`${baseInputClass} ${searchParams.get('beds') ? activeClass : inactiveClass}`}
        >
          <option value="">Bedrooms</option>
          <option value="0">Studio</option>
          <option value="1">1 bed</option>
          <option value="2">2 bed</option>
          <option value="3">3 bed</option>
          <option value="4">4+ bed</option>
        </select>

        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--surface-400)]">$</span>
          <input
            type="number"
            placeholder="Min price"
            min="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className={`w-28 pl-7 ${baseInputClass} ${minPrice ? activeClass : inactiveClass}`}
            aria-label="Minimum price"
          />
        </div>

        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--surface-400)]">$</span>
          <input
            type="number"
            placeholder="Max price"
            min="0"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className={`w-28 pl-7 ${baseInputClass} ${maxPrice ? activeClass : inactiveClass}`}
            aria-label="Maximum price"
          />
        </div>

        <select
          data-testid="sort-filter"
          aria-label="Sort order"
          value={searchParams.get('sort') ?? ''}
          onChange={(e) => updateParam('sort', e.target.value)}
          className={`${baseInputClass} ${searchParams.get('sort') ? activeClass : inactiveClass}`}
        >
          <option value="">Sort by</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="fairness">Best Value</option>
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-[var(--surface-500)] hover:text-[var(--surface-700)] hover:bg-[var(--surface-50)] transition-colors"
            aria-label="Clear all filters"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
            Clear{activeCount > 1 ? ` (${activeCount})` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
