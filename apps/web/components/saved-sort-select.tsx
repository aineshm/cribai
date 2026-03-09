'use client';

import { useRouter, usePathname } from 'next/navigation';

interface SavedSortSelectProps {
  readonly currentSort: string;
}

export function SavedSortSelect({ currentSort }: SavedSortSelectProps) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const params = new URLSearchParams();
    if (value && value !== 'date_saved') {
      params.set('sort', value);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ''}`);
  }

  return (
    <select
      value={currentSort}
      onChange={handleChange}
      aria-label="Sort saved listings"
      className="rounded-xl border border-[var(--surface-200)] bg-white px-3 py-2 text-sm text-[var(--surface-700)] focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)] transition-colors"
    >
      <option value="date_saved">Recently saved</option>
      <option value="price_asc">Price: Low to High</option>
      <option value="price_desc">Price: High to Low</option>
      <option value="fairness">Best Value</option>
    </select>
  );
}
