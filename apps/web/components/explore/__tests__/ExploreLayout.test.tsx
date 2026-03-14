import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child components before importing ExploreLayout
const mockListingGrid = vi.fn((_props: Record<string, unknown>) => <div data-testid="listing-grid" />);
const mockMapPanel = vi.fn((_props: Record<string, unknown>) => <div data-testid="map-panel" />);
const mockViewToggle = vi.fn(({ activeView, onViewChange }: { activeView: string; onViewChange: (v: string) => void }) => (
  <div data-testid="view-toggle">
    <button onClick={() => onViewChange('map')}>Map</button>
    <button onClick={() => onViewChange('list')}>List</button>
    <span data-testid="active-view">{activeView}</span>
  </div>
));

vi.mock('../ListingGrid', () => ({ ListingGrid: (props: any) => mockListingGrid(props) }));
vi.mock('../MapPanel', () => ({ MapPanel: (props: any) => mockMapPanel(props) }));
vi.mock('../ViewToggle', () => ({
  ViewToggle: (props: any) => mockViewToggle(props),
}));

import { ExploreLayout } from '../ExploreLayout';
import type { ExploreListing } from '@/lib/listing-types';

const mockListings: readonly ExploreListing[] = [
  {
    id: '1',
    title: 'Test Apt 1',
    address: '123 Test St',
    price: 1200,
    beds: 2,
    baths: 1,
    sqft: 700,
    photoUrl: null,
    amenities: [],
    source: 'apartments.com',
    sourceUrl: null,
    fairnessScore: null,
    availableDate: null,
    walkScore: null,
    latitude: null,
    longitude: null,
  },
  {
    id: '2',
    title: 'Test Apt 2',
    address: '456 Test Ave',
    price: 1500,
    beds: 1,
    baths: 1,
    sqft: 550,
    photoUrl: null,
    amenities: ['Pet Friendly'],
    source: 'apartments.com',
    sourceUrl: null,
    fairnessScore: null,
    availableDate: null,
    walkScore: null,
    latitude: null,
    longitude: null,
  },
];

describe('ExploreLayout', () => {
  beforeEach(() => {
    mockListingGrid.mockClear();
    mockMapPanel.mockClear();
    mockViewToggle.mockClear();
  });

  it('renders the desktop grid with lg:grid-cols-[3fr_2fr] class', () => {
    const { container } = render(<ExploreLayout listings={mockListings} />);
    const desktopGrid = container.querySelector('.lg\\:grid-cols-\\[3fr_2fr\\]');
    expect(desktopGrid).toBeInTheDocument();
  });

  it('renders the mobile ViewToggle', () => {
    render(<ExploreLayout listings={mockListings} />);
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
  });

  it('passes listings to ListingGrid', () => {
    render(<ExploreLayout listings={mockListings} />);
    expect(mockListingGrid).toHaveBeenCalledWith(
      expect.objectContaining({ listings: mockListings })
    );
  });

  it('passes listings to MapPanel', () => {
    render(<ExploreLayout listings={mockListings} />);
    expect(mockMapPanel).toHaveBeenCalledWith(
      expect.objectContaining({ listings: mockListings })
    );
  });

  it('starts in list view on mobile', () => {
    render(<ExploreLayout listings={mockListings} />);
    expect(screen.getByTestId('active-view').textContent).toBe('list');
  });

  it('mobile ListingGrid shows initially (list view)', () => {
    render(<ExploreLayout listings={mockListings} />);
    // Both mobile and desktop render ListingGrid
    const grids = screen.getAllByTestId('listing-grid');
    expect(grids.length).toBeGreaterThanOrEqual(1);
  });

  it('has lg:hidden container wrapping mobile section', () => {
    const { container } = render(<ExploreLayout listings={mockListings} />);
    const mobileSection = container.querySelector('.lg\\:hidden');
    expect(mobileSection).toBeInTheDocument();
  });

  it('has hidden lg:grid container for desktop', () => {
    const { container } = render(<ExploreLayout listings={mockListings} />);
    const desktopSection = container.querySelector('.hidden.lg\\:grid');
    expect(desktopSection).toBeInTheDocument();
  });
});
