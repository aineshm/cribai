import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MapBlock } from '@campusnest/types';

// Mock react-map-gl/mapbox
vi.mock('react-map-gl/mapbox', () => ({
  Map: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div data-testid="map" data-style={JSON.stringify(props.style)}>
      {children}
    </div>
  ),
  Marker: ({
    children,
    onClick,
    latitude,
    longitude,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    latitude: number;
    longitude: number;
  }) => (
    <div
      data-testid="marker"
      data-lat={latitude}
      data-lng={longitude}
      onClick={onClick}
    >
      {children}
    </div>
  ),
  Popup: ({
    children,
    onClose,
  }: {
    children?: React.ReactNode;
    onClose?: () => void;
  }) => (
    <div data-testid="popup" onClick={onClose}>
      {children}
    </div>
  ),
}));

// Mock mapbox-gl CSS
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { ChatMapBlock } from '../chat-map-block';
import { ChatMapPopup } from '../chat-map-popup';

const mockListings: MapBlock['listings'] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    address: '123 State St',
    rentMonthly: 1200,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 800,
    fairnessScore: 7,
    trueCostTotal: 1350,
    amenities: ['wifi'],
    latitude: 43.073,
    longitude: -89.401,
    photoUrl: 'https://example.com/photo1.jpg',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    address: '456 University Ave',
    rentMonthly: 950,
    bedrooms: 1,
    bathrooms: 1,
    sqft: 500,
    fairnessScore: 5,
    trueCostTotal: 1050,
    amenities: [],
    latitude: 43.075,
    longitude: -89.403,
    photoUrl: null,
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    address: '789 Langdon St',
    rentMonthly: 1500,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1100,
    fairnessScore: 8,
    trueCostTotal: 1600,
    amenities: ['parking'],
    latitude: 43.077,
    longitude: -89.399,
    photoUrl: 'https://example.com/photo3.jpg',
  },
];

const mockBlock: MapBlock = {
  type: 'map',
  listings: mockListings,
  center: { lat: 43.075, lng: -89.401 },
  zoom: 14,
};

describe('ChatMapBlock', () => {
  it('renders correct number of markers for listings', () => {
    render(<ChatMapBlock block={mockBlock} campusSlug="uw-madison" />);
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(3);
  });

  it('displays price labels on markers', () => {
    render(<ChatMapBlock block={mockBlock} campusSlug="uw-madison" />);
    const markers = screen.getAllByTestId('marker');
    expect(markers[0].textContent).toContain('$1,200');
    expect(markers[1].textContent).toContain('$950');
    expect(markers[2].textContent).toContain('$1,500');
  });

  it('opens popup when marker is clicked', () => {
    render(<ChatMapBlock block={mockBlock} campusSlug="uw-madison" />);
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();

    const markers = screen.getAllByTestId('marker');
    fireEvent.click(markers[0]);

    expect(screen.getByTestId('popup')).toBeInTheDocument();
    expect(screen.getByText('123 State St')).toBeInTheDocument();
  });

  it('highlights selected marker pin', () => {
    render(<ChatMapBlock block={mockBlock} campusSlug="uw-madison" />);
    const markers = screen.getAllByTestId('marker');
    fireEvent.click(markers[0]);

    // The selected pin should have blue bg class
    const priceLabels = screen.getAllByText('$1,200');
    const selectedLabel = priceLabels.find((el) =>
      el.className.includes('bg-blue-600')
    );
    expect(selectedLabel).toBeTruthy();
  });

  it('renders nothing for empty listings array', () => {
    const emptyBlock: MapBlock = {
      type: 'map',
      listings: [],
      center: { lat: 43.075, lng: -89.401 },
      zoom: 14,
    };
    const { container } = render(
      <ChatMapBlock block={emptyBlock} campusSlug="uw-madison" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders map container with rounded corners', () => {
    render(<ChatMapBlock block={mockBlock} campusSlug="uw-madison" />);
    const map = screen.getByTestId('map');
    expect(map.parentElement).toHaveClass('rounded-lg');
    expect(map.parentElement).toHaveClass('overflow-hidden');
  });
});

describe('ChatMapPopup', () => {
  it('shows address, rent, and beds/baths', () => {
    render(
      <ChatMapPopup listing={mockListings[0]} campusSlug="uw-madison" />
    );
    expect(screen.getByText('123 State St')).toBeInTheDocument();
    expect(screen.getByText(/\$1,200\/mo/)).toBeInTheDocument();
    expect(screen.getByText(/2bd/)).toBeInTheDocument();
    expect(screen.getByText(/1ba/)).toBeInTheDocument();
  });

  it('renders photo when photoUrl is provided', () => {
    render(
      <ChatMapPopup listing={mockListings[0]} campusSlug="uw-madison" />
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/photo1.jpg');
  });

  it('skips photo when photoUrl is null', () => {
    render(
      <ChatMapPopup listing={mockListings[1]} campusSlug="uw-madison" />
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders View details link with correct URL', () => {
    render(
      <ChatMapPopup listing={mockListings[0]} campusSlug="uw-madison" />
    );
    const link = screen.getByText('View details');
    expect(link.closest('a')).toHaveAttribute(
      'href',
      '/uw-madison/listings/11111111-1111-1111-1111-111111111111'
    );
  });
});
