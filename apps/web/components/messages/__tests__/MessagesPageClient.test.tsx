import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagesPageClient } from '../MessagesPageClient';

const selectMission = vi.fn();

let mockedState: {
  missions: Array<Record<string, unknown>>;
  selectedMission: Record<string, unknown> | null;
} = {
  missions: [],
  selectedMission: null,
};

vi.mock('@/components/concierge/ConciergeProvider', () => ({
  useConcierge: () => ({
    missions: mockedState.missions,
    selectedMission: mockedState.selectedMission,
    selectMission,
  }),
}));

const activeMission = {
  id: 'mission-active',
  type: 'housing_search',
  title: 'Find a studio near campus',
  status: 'running',
  listingTitle: '',
  createdAt: '2026-03-10T10:00:00.000Z',
  updatedAt: '2026-03-12T10:00:00.000Z',
  summary: 'Actively searching for listings.',
  logs: [],
};

const pastMission = {
  id: 'mission-past',
  type: 'housing_search',
  title: 'Compare Elm Apartments and Grove Lofts',
  status: 'completed',
  listingTitle: '',
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-08T10:00:00.000Z',
  summary: 'Comparison finished.',
  logs: [],
};

describe('MessagesPageClient', () => {
  beforeEach(() => {
    selectMission.mockReset();
    mockedState = {
      missions: [activeMission, pastMission],
      selectedMission: null,
    };
  });

  it('switches to the past tab when a past mission is already selected in shared context', () => {
    mockedState.selectedMission = pastMission;

    render(<MessagesPageClient />);

    expect(screen.getByRole('button', { name: /^Past$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Active/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clears the selection when the user switches to a tab that does not contain the selected mission', () => {
    mockedState.selectedMission = pastMission;

    render(<MessagesPageClient />);

    fireEvent.click(screen.getByRole('button', { name: /^Active/ }));

    expect(selectMission).toHaveBeenCalledWith(null);
  });
});
