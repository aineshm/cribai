import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeaseSummary } from '../LeaseSummary';
import { MOCK_LISTING_DETAIL } from '@/lib/mock-listing-detail';

const mockLeaseSummary = {
  length: '12 months',
  deposit: 1450,
  petDeposit: 300,
  moveInDate: 'August 1, 2026',
  utilitiesIncluded: ['Water', 'Trash'],
  utilitiesTenantPaid: ['Electricity'],
};

describe('LeaseSummary', () => {
  describe('MOCK_LISTING_DETAIL', () => {
    it('has a non-empty aiSummary string', () => {
      expect(MOCK_LISTING_DETAIL.aiSummary).toBeDefined();
      expect(typeof MOCK_LISTING_DETAIL.aiSummary).toBe('string');
      expect((MOCK_LISTING_DETAIL.aiSummary as string).length).toBeGreaterThan(0);
    });
  });

  describe('aiSummary prose rendering', () => {
    it('renders aiSummary prose paragraph when aiSummary prop is provided', () => {
      render(
        <LeaseSummary
          leaseSummary={mockLeaseSummary}
          aiSummary="Test summary text for AI prose"
        />
      );

      expect(screen.getByText('Test summary text for AI prose')).toBeInTheDocument();
    });

    it('renders without error when aiSummary prop is omitted', () => {
      render(<LeaseSummary leaseSummary={mockLeaseSummary} />);

      // Structured lease data still renders
      expect(screen.getByText('12 months')).toBeInTheDocument();
    });

    it('renders aiSummary text visible to screen readers (not hidden)', () => {
      render(
        <LeaseSummary
          leaseSummary={mockLeaseSummary}
          aiSummary="Accessible summary text"
        />
      );

      const prose = screen.getByText('Accessible summary text');
      expect(prose).toBeInTheDocument();
      expect(prose).not.toHaveAttribute('aria-hidden', 'true');
    });
  });
});
