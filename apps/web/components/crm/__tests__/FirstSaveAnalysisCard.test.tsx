import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FirstSaveAnalysisCard } from '../FirstSaveAnalysisCard';
import { ANALYSIS_FULL, ANALYSIS_PARTIAL } from '@/lib/crm/fixtures';

describe('FirstSaveAnalysisCard', () => {
  it('renders the true-cost total when ok', () => {
    render(<FirstSaveAnalysisCard analysis={ANALYSIS_FULL} />);
    expect(screen.getByText(/true cost/i)).toBeInTheDocument();
  });
  it('renders a skipped branch gracefully', () => {
    render(<FirstSaveAnalysisCard analysis={ANALYSIS_PARTIAL} />);
    expect(screen.getByText(/couldn.t check/i)).toBeInTheDocument();
  });
});
