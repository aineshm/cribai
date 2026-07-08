import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagesPageClient } from '../MessagesPageClient';

let mockedState: {
  missions: Array<Record<string, unknown>>;
  selectedMission: Record<string, unknown> | null;
} = {
  missions: [],
  selectedMission: null,
};

// Stateful stand-in for the real ConciergeProvider: calling selectMission
// updates the mocked context value so the next render reflects the new
// selection, matching how the real provider propagates selection changes.
const selectMission = vi.fn((mission: Record<string, unknown> | null) => {
  mockedState = { ...mockedState, selectedMission: mission };
});

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

function terminalMission(id: string, title: string, updatedAt: string) {
  return {
    id,
    type: 'housing_search',
    title,
    status: 'completed',
    listingTitle: '',
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt,
    summary: `${title} summary`,
    logs: [],
  };
}

const missionFirst = terminalMission('mission-first', 'First mission', '2026-03-05T10:00:00.000Z');
const missionMiddle = terminalMission('mission-middle', 'Middle mission', '2026-03-06T10:00:00.000Z');
const missionLast = terminalMission('mission-last', 'Last mission', '2026-03-07T10:00:00.000Z');

describe('MessagesPageClient', () => {
  beforeEach(() => {
    selectMission.mockClear();
    mockedState = {
      missions: [activeMission, pastMission],
      selectedMission: null,
    };
  });

  it('archiving the middle queue item selects the next item and stays on the queue tab', () => {
    mockedState = {
      missions: [missionFirst, missionMiddle, missionLast],
      selectedMission: missionMiddle,
    };

    render(<MessagesPageClient searchParams={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move To Past' }));

    expect(selectMission).toHaveBeenCalledWith(missionLast);
    expect(screen.getByRole('button', { name: /^Queue/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Past/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('archiving the last queue item selects the previous item and stays on the queue tab', () => {
    mockedState = {
      missions: [missionFirst, missionMiddle, missionLast],
      selectedMission: missionLast,
    };

    render(<MessagesPageClient searchParams={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move To Past' }));

    expect(selectMission).toHaveBeenCalledWith(missionMiddle);
    expect(screen.getByRole('button', { name: /^Queue/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Past/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('archiving the only queue item clears the selection, stays on the queue tab, and renders the empty state', () => {
    mockedState = {
      missions: [missionFirst],
      selectedMission: missionFirst,
    };

    render(<MessagesPageClient searchParams={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move To Past' }));

    expect(selectMission).toHaveBeenCalledWith(null);
    expect(screen.getByRole('button', { name: /^Queue/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Past/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Queue is empty')).toBeInTheDocument();
    expect(screen.getByText('Select a mission')).toBeInTheDocument();
  });

  it('shows the archived mission under the Past tab after Move To Past', () => {
    mockedState = {
      missions: [missionFirst, missionMiddle, missionLast],
      selectedMission: missionMiddle,
    };

    render(<MessagesPageClient searchParams={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move To Past' }));
    fireEvent.click(screen.getByRole('button', { name: /^Past/ }));

    expect(screen.getByRole('button', { name: /^Past/ })).toHaveAttribute('aria-pressed', 'true');
    const pastList = screen.getByText('Middle mission').closest('button');
    expect(pastList).not.toBeNull();
    expect(within(pastList as HTMLElement).getByText('Middle mission')).toBeInTheDocument();
  });
});
