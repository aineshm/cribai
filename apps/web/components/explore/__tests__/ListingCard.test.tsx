import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ListingCard } from '../ListingCard';
import type { ExploreListing } from '@/lib/listing-types';

const baseListing: ExploreListing = {
  id: 'apt-42',
  title: 'Modern Studio on State St',
  address: '432 State St, Madison, WI',
  price: 1250,
  beds: 0,
  baths: 1,
  sqft: 475,
  photoUrl: null,
  amenities: ['Laundry', 'Gym'],
  source: 'zillow',
  sourceUrl: null,
  fairnessScore: null,
  availableDate: null,
  walkScore: 92,
};

const twoBedroomListing: ExploreListing = {
  ...baseListing,
  id: 'apt-99',
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
    render(<ListingCard listing={twoBedroomListing} />);
    expect(screen.getByText('2 bd')).toBeInTheDocument();
  });

  it('renders baths label', () => {
    render(<ListingCard listing={baseListing} />);
    expect(screen.getByText('1 ba')).toBeInTheDocument();
  });

  it('renders walk score when available', () => {
    render(<ListingCard listing={baseListing} />);
    expect(screen.getByText('92')).toBeInTheDocument();
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

  it('renders source badge when listing has a photo', () => {
    const withPhoto: ExploreListing = {
      ...baseListing,
      photoUrl: 'https://example.com/photo.jpg',
    };
    render(<ListingCard listing={withPhoto} />);
    expect(screen.getByText('zillow')).toBeInTheDocument();
  });

  it('renders address', () => {
    render(<ListingCard listing={baseListing} />);
    expect(screen.getByText('432 State St, Madison, WI')).toBeInTheDocument();
  });
});
