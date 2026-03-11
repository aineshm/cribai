import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterChips } from '../FilterChips';

const emptyFilters = new Set<string>();

describe('FilterChips', () => {
  it('renders all 6 filter chip buttons', () => {
    render(
      <FilterChips
        resultCount={10}
        activeFilters={emptyFilters}
        onFiltersChange={vi.fn()}
      />
    );
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getByText('Beds')).toBeInTheDocument();
    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(screen.getByText('Move-in Date')).toBeInTheDocument();
    expect(screen.getByText('Pet Friendly')).toBeInTheDocument();
    expect(screen.getByText('Furnished')).toBeInTheDocument();
  });

  it('shows result count text with campus name', () => {
    render(
      <FilterChips
        resultCount={42}
        campusName="UW-Madison"
        activeFilters={emptyFilters}
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
        activeFilters={emptyFilters}
        onFiltersChange={vi.fn()}
      />
    );
    expect(screen.getByText(/apartments near UW-Madison/)).toBeInTheDocument();
  });

  it('inactive chip has aria-pressed="false"', () => {
    render(
      <FilterChips
        resultCount={10}
        activeFilters={emptyFilters}
        onFiltersChange={vi.fn()}
      />
    );
    const priceBtn = screen.getByText('Price').closest('button');
    expect(priceBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('active chip has aria-pressed="true"', () => {
    const activeFilters = new Set(['price']);
    render(
      <FilterChips
        resultCount={10}
        activeFilters={activeFilters}
        onFiltersChange={vi.fn()}
      />
    );
    const priceBtn = screen.getByText('Price').closest('button');
    expect(priceBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking an inactive chip calls onFiltersChange with chip id added', () => {
    const onFiltersChange = vi.fn();
    render(
      <FilterChips
        resultCount={10}
        activeFilters={emptyFilters}
        onFiltersChange={onFiltersChange}
      />
    );
    fireEvent.click(screen.getByText('Beds').closest('button')!);
    expect(onFiltersChange).toHaveBeenCalledOnce();
    const result: Set<string> = onFiltersChange.mock.calls[0][0];
    expect(result.has('beds')).toBe(true);
  });

  it('clicking an active chip calls onFiltersChange with chip id removed', () => {
    const onFiltersChange = vi.fn();
    const activeFilters = new Set(['price', 'beds']);
    render(
      <FilterChips
        resultCount={10}
        activeFilters={activeFilters}
        onFiltersChange={onFiltersChange}
      />
    );
    fireEvent.click(screen.getByText('Price').closest('button')!);
    expect(onFiltersChange).toHaveBeenCalledOnce();
    const result: Set<string> = onFiltersChange.mock.calls[0][0];
    expect(result.has('price')).toBe(false);
    expect(result.has('beds')).toBe(true);
  });

  it('clicking Furnished chip adds "furnished" to filters', () => {
    const onFiltersChange = vi.fn();
    render(
      <FilterChips
        resultCount={10}
        activeFilters={emptyFilters}
        onFiltersChange={onFiltersChange}
      />
    );
    fireEvent.click(screen.getByText('Furnished').closest('button')!);
    const result: Set<string> = onFiltersChange.mock.calls[0][0];
    expect(result.has('furnished')).toBe(true);
  });
});
