import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HousingSearchResultCard } from '../HousingSearchResultCard';
import type { ShortlistReport } from '@campusnest/types';

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'div') {
          return ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) =>
            React.createElement('div', rest, children);
        }
        return undefined;
      },
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

const MOCK_REPORT: ShortlistReport = {
  missionId: '00000000-0000-0000-0000-000000000001',
  generatedAt: '2026-03-12T14:00:00.000Z',
  totalSearched: 10,
  items: [
    {
      rank: 1,
      listingId: '00000000-0000-0000-0000-000000000002',
      address: '123 Campus Drive',
      rentMonthly: 900,
      compositeScore: 0.82,
      fairnessScore: 8,
      reviewRating: 4.2,
      walkScore: 85,
      preferenceScore: 9,
      reasoning: 'Excellent walkability and fair price near campus.',
    },
    {
      rank: 2,
      listingId: '00000000-0000-0000-0000-000000000003',
      address: '456 State Street',
      rentMonthly: 1100,
      compositeScore: 0.71,
      fairnessScore: 6,
      reviewRating: 3.8,
      walkScore: 70,
      preferenceScore: 7,
      reasoning: 'Good reviews but slightly above your budget.',
    },
  ],
};

describe('HousingSearchResultCard', () => {
  it('renders all items from the report', () => {
    render(<HousingSearchResultCard report={MOCK_REPORT} />);
    expect(screen.getByText('123 Campus Drive')).toBeInTheDocument();
    expect(screen.getByText('456 State Street')).toBeInTheDocument();
  });

  it('renders rank badges for each item', () => {
    render(<HousingSearchResultCard report={MOCK_REPORT} />);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('renders the empty state when items array is empty', () => {
    const emptyReport: ShortlistReport = { ...MOCK_REPORT, items: [] };
    render(<HousingSearchResultCard report={emptyReport} />);
    expect(screen.getByText(/No listings matched/i)).toBeInTheDocument();
  });

  it('renders reasoning text for each item', () => {
    render(<HousingSearchResultCard report={MOCK_REPORT} />);
    expect(screen.getByText('Excellent walkability and fair price near campus.')).toBeInTheDocument();
    expect(screen.getByText('Good reviews but slightly above your budget.')).toBeInTheDocument();
  });

  it('shows totalSearched count in the header', () => {
    render(<HousingSearchResultCard report={MOCK_REPORT} />);
    expect(screen.getByText(/2 of 10 listings/i)).toBeInTheDocument();
  });
});
