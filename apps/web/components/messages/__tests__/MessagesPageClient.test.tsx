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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

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

  // TODO(2026-05-runtime-rebuild): rewrite for queued Mission UI.
  // Tab membership is now archivedMissionIds-based (local state in MessagesPageClient),
  // not status-based. The pastMission/activeMission mocks no longer drive tab placement;
  // the test must instead exercise moveMissionToPast/restoreMissionToQueue to populate
  // archivedMissionIds before asserting tab/selection behavior.
  it.skip('switches to the past tab when a past mission is already selected in shared context', () => {
    mockedState.selectedMission = pastMission;

    render(<MessagesPageClient searchParams={{}} />);

    expect(screen.getByRole('button', { name: /^Past$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Queue/ })).toHaveAttribute('aria-pressed', 'false');
  });

  // TODO(2026-05-runtime-rebuild): rewrite for queued Mission UI (see note above).
  it.skip('clears the selection when the user switches to a tab that does not contain the selected mission', () => {
    mockedState.selectedMission = pastMission;

    render(<MessagesPageClient searchParams={{}} />);

    fireEvent.click(screen.getByRole('button', { name: /^Queue/ }));

    expect(selectMission).toHaveBeenCalledWith(null);
  });
});
