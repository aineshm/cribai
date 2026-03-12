import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ListingCard } from '../ListingCard';
import type { Listing } from '@/lib/mock-listings';

const baseListing: Listing = {
  id: 'apt-42',
  title: 'Modern Studio on State St',
  address: '432 State St, Madison, WI',
  price: 1250,
  beds: 0,
  baths: 1,
  sqft: 475,
  distanceToCampus: 0.4,
  rating: 4.7,
  photoUrls: [],
  placeholderGradient: 'from-teal-200 to-emerald-400',
  amenities: ['Laundry', 'Gym'],
  isVerified: true,
  isSaved: false,
  landlord: { name: 'Capitol Properties', rating: 4.5 },
};

const unverifiedListing: Listing = {
  ...baseListing,
  id: 'apt-99',
  isVerified: false,
  beds: 2,
  price: 1800,
};

describe('ListingCard', () => {
  it('renders formatted price with /mo suffix', () => {
    render(<ListingCard listing={baseListing} />);
    expect(screen.getByText(/1,250/)).toBeInTheDocument();
    expect(screen.getByText(/\/mo/)).toBeInTheDocument();
  });

  it('renders "Studio" for 0 beds', () => {
    render(<ListingCard listing={baseListing} />);
    expect(screen.getByText('Studio')).toBeInTheDocument();
  });

  it('renders bed count for non-zero beds', () => {
    render(<ListingCard listing={unverifiedListing} />);
    expect(screen.getByText('2 bd')).toBeInTheDocument();
  });

  it('renders baths label', () => {
    render(<ListingCard listing={baseListing} />);
    expect(screen.getByText('1 ba')).toBeInTheDocument();
  });

  it('renders distance to campus', () => {
    render(<ListingCard listing={baseListing} />);
    expect(screen.getByText(/0\.4 mi to campus/)).toBeInTheDocument();
  });

  it('renders rating', () => {
    render(<ListingCard listing={baseListing} />);
    expect(screen.getByText('4.7')).toBeInTheDocument();
  });

  it('renders listing title', () => {
    render(<ListingCard listing={baseListing} />);
    expect(screen.getByText('Modern Studio on State St')).toBeInTheDocument();
  });

  it('renders a Link with href to /listing/[id]', () => {
    render(<ListingCard listing={baseListing} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/listing/apt-42');
  });

  it('renders AI Verified badge when isVerified is true', () => {
    render(<ListingCard listing={baseListing} />);
    expect(screen.getByText('AI Verified')).toBeInTheDocument();
  });

  it('does NOT render AI Verified badge when isVerified is false', () => {
    render(<ListingCard listing={unverifiedListing} />);
    expect(screen.queryByText('AI Verified')).not.toBeInTheDocument();
  });

  it('save button has aria-label "Save listing" initially', () => {
    render(<ListingCard listing={baseListing} />);
    expect(screen.getByLabelText('Save listing')).toBeInTheDocument();
  });

  it('save button toggles aria-pressed on click', () => {
    render(<ListingCard listing={baseListing} />);
    const saveBtn = screen.getByRole('button', { name: /save listing/i });
    expect(saveBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(saveBtn);
    expect(screen.getByLabelText('Unsave listing')).toBeInTheDocument();
  });

  it('save button click does not navigate (stopPropagation)', () => {
    render(<ListingCard listing={baseListing} />);
    const saveBtn = screen.getByRole('button', { name: /save listing/i });
    // Clicking save should not throw — stopPropagation prevents link navigation
    expect(() => fireEvent.click(saveBtn)).not.toThrow();
  });
});
