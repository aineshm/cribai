/**
 * CrmCanvas ↔ crm_listings Realtime wiring (AIN-105).
 *
 * Mirrors BoardView.realtime.test.tsx — the hook itself is covered by
 * use-crm-listings-realtime.test.ts. This only asserts the wiring: a
 * realtime change event re-runs the same getList/listUnits fetch the canvas
 * uses on mount (rank/compare stay on their own lazy-load effects — the plan
 * scopes the realtime refetch to the primary list only).
 */
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crmClient } from '@/lib/crm-client';
import { CrmCanvas } from '../CrmCanvas';

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

describe('CrmCanvas realtime wiring (AIN-105)', () => {
  beforeEach(() => {
    capturedOnRefetch.length = 0;
    useCrmListingsRealtimeMock.mockClear();
  });

  it('subscribes once the viewer id resolves', async () => {
    render(<CrmCanvas />);
    await waitFor(() =>
      expect(useCrmListingsRealtimeMock).toHaveBeenCalledWith('viewer-1', expect.any(Function)),
    );
  });

  it('a realtime change event re-runs the getList + listUnits fetch', async () => {
    const getListSpy = vi.spyOn(crmClient, 'getList');
    const listUnitsSpy = vi.spyOn(crmClient, 'listUnits');

    render(<CrmCanvas />);
    await waitFor(() => expect(capturedOnRefetch.length).toBeGreaterThan(0));

    const callsBefore = getListSpy.mock.calls.length;
    capturedOnRefetch[0]!();

    await waitFor(() => expect(getListSpy.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(listUnitsSpy.mock.calls.length).toBeGreaterThan(1);

    getListSpy.mockRestore();
    listUnitsSpy.mockRestore();
  });
});
