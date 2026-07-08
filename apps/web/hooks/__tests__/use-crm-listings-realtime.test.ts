/**
 * Tests for useCrmListingsRealtime (AIN-105).
 *
 * Mirrors use-missions-realtime.test.ts's channel-lifecycle coverage, plus
 * the debounce coalescing this hook adds: a burst of postgres_changes events
 * (e.g. a save's INSERT + the AIN-95 nickname UPDATE landing 0.2s apart)
 * should trigger only ONE refetch, not one per event.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCrmListingsRealtime } from '../use-crm-listings-realtime';

const mockRemoveChannel = vi.fn();
const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() });
const mockOn = vi.fn().mockReturnThis();
const mockChannel = vi.fn().mockReturnValue({
  on: mockOn,
  subscribe: mockSubscribe,
});

vi.mock('@campusnest/supabase/client', () => ({
  createClient: () => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

/** Capture the postgres_changes handler registered via `.on(...)`. */
function capturedHandler(): (payload: unknown) => void {
  const call = mockOn.mock.calls[0] as unknown as [string, unknown, (payload: unknown) => void];
  return call[2];
}

/** Capture the `.subscribe(status => ...)` status callback. */
function capturedStatusCallback(): (status: string) => void {
  const call = mockSubscribe.mock.calls[0] as unknown as [(status: string) => void];
  return call[0];
}

describe('useCrmListingsRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOn.mockReturnThis();
    mockChannel.mockReturnValue({ on: mockOn, subscribe: mockSubscribe });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not subscribe when userId is null', () => {
    renderHook(() => useCrmListingsRealtime(null, vi.fn()));
    expect(mockChannel).not.toHaveBeenCalled();
  });

  it('creates a per-user private channel scoped to crm_listings', () => {
    renderHook(() => useCrmListingsRealtime('user-123', vi.fn()));
    expect(mockChannel).toHaveBeenCalledWith('crm_listings:user-123', { config: { private: true } });
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: '*',
        schema: 'public',
        table: 'crm_listings',
        filter: 'user_id=eq.user-123',
      }),
      expect.any(Function),
    );
  });

  it('subscribes on mount', () => {
    renderHook(() => useCrmListingsRealtime('user-123', vi.fn()));
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('calls removeChannel on unmount', () => {
    const { unmount } = renderHook(() => useCrmListingsRealtime('user-123', vi.fn()));
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('debounces a burst of change events into a single refetch call', () => {
    vi.useFakeTimers();
    const onRefetch = vi.fn();
    renderHook(() => useCrmListingsRealtime('user-123', onRefetch));

    const handler = capturedHandler();
    // A save's INSERT + the AIN-95 nickname UPDATE landing ~0.2s apart.
    handler({ eventType: 'INSERT' });
    vi.advanceTimersByTime(200);
    handler({ eventType: 'UPDATE' });

    expect(onRefetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it('fires a refetch once the channel reaches SUBSCRIBED (closes the resubscribe gap)', () => {
    vi.useFakeTimers();
    const onRefetch = vi.fn();
    renderHook(() => useCrmListingsRealtime('user-123', onRefetch));

    capturedStatusCallback()('SUBSCRIBED');
    vi.advanceTimersByTime(400);
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it('clears a pending debounce timer on unmount so it never fires after teardown', () => {
    vi.useFakeTimers();
    const onRefetch = vi.fn();
    const { unmount } = renderHook(() => useCrmListingsRealtime('user-123', onRefetch));

    capturedHandler()({ eventType: 'INSERT' });
    unmount();
    vi.advanceTimersByTime(1000);

    expect(onRefetch).not.toHaveBeenCalled();
  });
});
