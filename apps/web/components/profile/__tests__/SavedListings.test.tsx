import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavedListings } from '../SavedListings';

// Mock framer-motion to avoid animation issues in test environment
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Heart: () => <svg data-testid="heart-icon" />,
  MapPin: () => <svg data-testid="map-pin-icon" />,
  DollarSign: () => <svg data-testid="dollar-sign-icon" />,
}));

const DEMO_LISTINGS = [
  { id: '1', title: 'Cozy Studio near Campus', address: '123 College Ave', price: 950 },
  { id: '2', title: 'Spacious 2BR Apartment', address: '456 University Blvd', price: 1400 },
  { id: '3', title: 'Modern Room in Shared House', address: '789 Oak St', price: 750 },
];

describe('SavedListings', () => {
  // PROF-02: Each card must be a Link navigating to /listing/{id}
  it('renders a link for each listing with correct href', () => {
    render(<SavedListings listings={DEMO_LISTINGS} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', '/listing/1');
    expect(links[1]).toHaveAttribute('href', '/listing/2');
    expect(links[2]).toHaveAttribute('href', '/listing/3');
  });

  it('renders empty state when no listings prop is provided', () => {
    render(<SavedListings />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('No saved listings yet')).toBeInTheDocument();
  });

  it('renders empty state without links when listings array is empty', () => {
    render(<SavedListings listings={[]} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('No saved listings yet')).toBeInTheDocument();
  });
});
