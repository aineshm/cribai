import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RankCompareTable } from '../RankCompareTable';
import { RANK_RESULT, COMPARE_RESULT } from '@/lib/crm/fixtures';

describe('RankCompareTable', () => {
  it('rank mode shows scored rows', () => {
    render(<RankCompareTable result={RANK_RESULT} />);
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });
  it('compare mode shows a table', () => {
    render(<RankCompareTable result={COMPARE_RESULT} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
