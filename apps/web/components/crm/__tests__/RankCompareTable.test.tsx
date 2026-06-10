import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RankCompareTable } from '../RankCompareTable';
import { RANK_RESULT, COMPARE_RESULT } from '@/lib/crm/fixtures';

describe('RankCompareTable', () => {
  it('rank mode shows scored rows with contract-keyed dimension labels', () => {
    render(<RankCompareTable result={RANK_RESULT} />);
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    // Contract scoring features render with their display labels; the raw
    // contract keys (rent/bedrooms/sqft) must never leak into the UI.
    expect(screen.getAllByText('Price').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Beds').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Space').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Commute').length).toBeGreaterThan(0);
    expect(screen.queryByText('rent')).not.toBeInTheDocument();
  });
  it('compare mode shows a table', () => {
    render(<RankCompareTable result={COMPARE_RESULT} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
