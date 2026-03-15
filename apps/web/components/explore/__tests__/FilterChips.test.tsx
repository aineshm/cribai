import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterChips } from '../FilterChips';
import { DEFAULT_FILTERS, type FilterValues } from '@/lib/filter-listings';

describe('FilterChips', () => {
  it('renders all 5 filter controls', () => {
    render(
      <FilterChips
        resultCount={10}
        filters={DEFAULT_FILTERS}
        onFiltersChange={vi.fn()}
      />
    );
    expect(screen.getByText('Subleases')).toBeInTheDocument();
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getByText('Beds')).toBeInTheDocument();
    expect(screen.getByText('Pet Friendly')).toBeInTheDocument();
    expect(screen.getByText('Furnished')).toBeInTheDocument();
  });

  it('shows result count text with campus name', () => {
    render(
      <FilterChips
        resultCount={42}
        campusName="UW-Madison"
        filters={DEFAULT_FILTERS}
        onFiltersChange={vi.fn()}
      />
    );
    expect(screen.getByText(/42/)).toBeInTheDocument();
    expect(screen.getByText(/apartments near UW-Madison/)).toBeInTheDocument();
  });

  it('uses default campus name when not provided', () => {
    render(
      <FilterChips
        resultCount={5}
        filters={DEFAULT_FILTERS}
        onFiltersChange={vi.fn()}
      />
    );
    expect(screen.getByText(/apartments near UW-Madison/)).toBeInTheDocument();
  });

  it('inactive toggle chip has aria-pressed="false"', () => {
    render(
      <FilterChips
        resultCount={10}
        filters={DEFAULT_FILTERS}
        onFiltersChange={vi.fn()}
      />
    );
    const subleaseBtn = screen.getByText('Subleases').closest('button')!;
    expect(subleaseBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('active toggle chip has aria-pressed="true"', () => {
    const activeFilters: FilterValues = { ...DEFAULT_FILTERS, sublease: true };
    render(
      <FilterChips
        resultCount={10}
        filters={activeFilters}
        onFiltersChange={vi.fn()}
      />
    );
    const subleaseBtn = screen.getByText('Subleases').closest('button')!;
    expect(subleaseBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking Subleases toggle calls onFiltersChange with sublease: true', () => {
    const onFiltersChange = vi.fn();
    render(
      <FilterChips
        resultCount={10}
        filters={DEFAULT_FILTERS}
        onFiltersChange={onFiltersChange}
      />
    );
    fireEvent.click(screen.getByText('Subleases').closest('button')!);
    expect(onFiltersChange).toHaveBeenCalledOnce();
    const result = onFiltersChange.mock.calls[0]![0] as FilterValues;
    expect(result.sublease).toBe(true);
  });

  it('clicking Furnished toggle calls onFiltersChange with furnished: true', () => {
    const onFiltersChange = vi.fn();
    render(
      <FilterChips
        resultCount={10}
        filters={DEFAULT_FILTERS}
        onFiltersChange={onFiltersChange}
      />
    );
    fireEvent.click(screen.getByText('Furnished').closest('button')!);
    const result = onFiltersChange.mock.calls[0]![0] as FilterValues;
    expect(result.furnished).toBe(true);
  });

  it('shows Clear button when filters are active', () => {
    const activeFilters: FilterValues = { ...DEFAULT_FILTERS, petFriendly: true };
    render(
      <FilterChips
        resultCount={10}
        filters={activeFilters}
        onFiltersChange={vi.fn()}
      />
    );
    expect(screen.getByText(/Clear/)).toBeInTheDocument();
  });
});
