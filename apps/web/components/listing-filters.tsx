'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

export function ListingFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={searchParams.get('beds') ?? ''}
        onChange={(e) => updateParam('beds', e.target.value)}
        className="rounded-lg border px-3 py-2 text-sm"
      >
        <option value="">Bedrooms</option>
        <option value="0">Studio</option>
        <option value="1">1 bed</option>
        <option value="2">2 bed</option>
        <option value="3">3 bed</option>
        <option value="4">4+ bed</option>
      </select>

      <input
        type="number"
        placeholder="Min price"
        value={searchParams.get('minPrice') ?? ''}
        onChange={(e) => updateParam('minPrice', e.target.value)}
        className="w-28 rounded-lg border px-3 py-2 text-sm"
      />

      <input
        type="number"
        placeholder="Max price"
        value={searchParams.get('maxPrice') ?? ''}
        onChange={(e) => updateParam('maxPrice', e.target.value)}
        className="w-28 rounded-lg border px-3 py-2 text-sm"
      />

      <select
        value={searchParams.get('sort') ?? ''}
        onChange={(e) => updateParam('sort', e.target.value)}
        className="rounded-lg border px-3 py-2 text-sm"
      >
        <option value="">Sort by</option>
        <option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option>
        <option value="fairness">Best Value</option>
      </select>
    </div>
  );
}
