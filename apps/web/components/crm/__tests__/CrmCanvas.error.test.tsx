/**
 * AIN-60 — CrmCanvas async loaders must surface failures instead of hanging
 * on "Loading…" forever. The crm-client seam is mocked to reject.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    listUnits: vi.fn(),
    getList: vi.fn(),
    addListing: vi.fn(),
    getAnalysis: vi.fn(),
    rank: vi.fn(),
    deleteUnit: vi.fn(),
    firstUnitId: vi.fn(),
  },
}));

vi.mock('@/lib/crm-client', () => ({ crmClient: mockClient }));

import { CrmCanvas } from '../CrmCanvas';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CrmCanvas — loader error states (AIN-60)', () => {
  it('shows an error state when the initial load fails', async () => {
    mockClient.getList.mockRejectedValue(new Error('Authentication required'));
    mockClient.listUnits.mockRejectedValue(new Error('Authentication required'));
    mockClient.rank.mockRejectedValue(new Error('Authentication required'));

    render(<CrmCanvas />);
    await waitFor(() =>
      expect(screen.getByText(/couldn.t.*authentication required/i)).toBeInTheDocument(),
    );
  });

  it('a rank failure does NOT blank the listings — list tab still renders units (review M1)', async () => {
    const { CRM_LIST, UNITS } = await import('@/lib/crm/fixtures');
    mockClient.getList.mockResolvedValue(CRM_LIST);
    mockClient.listUnits.mockResolvedValue(UNITS);
    mockClient.rank.mockRejectedValue(new Error('profiles table hiccup'));

    render(<CrmCanvas />);
    // List tab (default) shows the units even though rank failed.
    const firstUnit = UNITS[0]!;
    await waitFor(() =>
      expect(
        screen.getAllByText(new RegExp(firstUnit._proposed.unit.building, 'i')).length,
      ).toBeGreaterThan(0),
    );
    // Rank tab shows its own error, not a blank/loading state.
    fireEvent.click(screen.getByRole('tab', { name: /rank/i }));
    await waitFor(() =>
      expect(screen.getByText(/couldn.t.*profiles table hiccup/i)).toBeInTheDocument(),
    );
  });

  it('shows an error state when the lazy compare load fails', async () => {
    mockClient.getList.mockResolvedValue({ id: 'l', name: 'My Apartments', ownerId: 'u-1', members: [] });
    mockClient.listUnits.mockResolvedValue([]);
    mockClient.rank.mockImplementation(async (mode: 'rank' | 'compare') => {
      if (mode === 'compare') throw new Error('rank endpoint down');
      return { mode: 'rank', ranked: [] };
    });

    render(<CrmCanvas />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /compare/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /compare/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn.t.*rank endpoint down/i)).toBeInTheDocument(),
    );
  });
});
