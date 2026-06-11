/**
 * AIN-60 — BoardView async loaders must surface failures instead of hanging
 * on an empty board forever. The crm-client seam is mocked to reject.
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

import { BoardView } from '../BoardView';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BoardView — loader error states (AIN-60)', () => {
  it('shows an error state when the initial load fails', async () => {
    mockClient.getList.mockRejectedValue(new Error('Authentication required'));
    mockClient.listUnits.mockRejectedValue(new Error('Authentication required'));

    render(<BoardView />);
    await waitFor(() =>
      expect(screen.getByText(/couldn.t.*authentication required/i)).toBeInTheDocument(),
    );
  });

  it('shows an error state when the lazy compare load fails', async () => {
    mockClient.getList.mockResolvedValue({ id: 'l', name: 'My Apartments', ownerId: 'u-1', members: [] });
    mockClient.listUnits.mockResolvedValue([]);
    mockClient.rank.mockRejectedValue(new Error('rank endpoint down'));

    render(<BoardView />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /compare/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /compare/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn.t.*rank endpoint down/i)).toBeInTheDocument(),
    );
  });
});
