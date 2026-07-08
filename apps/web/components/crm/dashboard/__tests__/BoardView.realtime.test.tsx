/**
 * BoardView ↔ crm_listings Realtime wiring (AIN-105).
 *
 * The hook itself (subscription lifecycle, debounce) is covered by
 * use-crm-listings-realtime.test.ts. This file only asserts BoardView wires
 * it correctly: resolves the viewer id, passes it + a refetch callback to
 * the hook, and that callback re-runs the same getList/listUnits fetch the
 * component uses on mount.
 */
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crmClient } from '@/lib/crm-client';
import { BoardView } from '../BoardView';

const capturedOnRefetch: Array<() => void> = [];
const useCrmListingsRealtimeMock = vi.fn(
  (userId: string | null, onRefetch: () => void) => {
    if (userId) capturedOnRefetch.push(onRefetch);
  },
);

vi.mock('@/hooks/use-crm-listings-realtime', () => ({
  useCrmListingsRealtime: (userId: string | null, onRefetch: () => void) =>
    useCrmListingsRealtimeMock(userId, onRefetch),
}));

vi.mock('@campusnest/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'tok', user: { id: 'viewer-1' } } },
      }),
    },
  }),
}));

describe('BoardView realtime wiring (AIN-105)', () => {
  beforeEach(() => {
    capturedOnRefetch.length = 0;
    useCrmListingsRealtimeMock.mockClear();
  });

  it('subscribes once the viewer id resolves', async () => {
    render(<BoardView />);
    await waitFor(() =>
      expect(useCrmListingsRealtimeMock).toHaveBeenCalledWith('viewer-1', expect.any(Function)),
    );
  });

  it('a realtime change event re-runs the getList + listUnits fetch', async () => {
    const getListSpy = vi.spyOn(crmClient, 'getList');
    const listUnitsSpy = vi.spyOn(crmClient, 'listUnits');

    render(<BoardView />);
    await waitFor(() => expect(capturedOnRefetch.length).toBeGreaterThan(0));

    const callsBefore = getListSpy.mock.calls.length;
    capturedOnRefetch[0]!();

    await waitFor(() => expect(getListSpy.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(listUnitsSpy.mock.calls.length).toBeGreaterThan(1);

    getListSpy.mockRestore();
    listUnitsSpy.mockRestore();
  });
});
