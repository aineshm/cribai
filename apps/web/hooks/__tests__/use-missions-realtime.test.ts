/**
 * Tests for useMissionsRealtime hook.
 *
 * Verifies Supabase Realtime channel lifecycle: subscription on mount,
 * cleanup on unmount, and no-op when userId is null.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMissionsRealtime } from '../use-missions-realtime';

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

describe('useMissionsRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOn.mockReturnThis();
    mockChannel.mockReturnValue({ on: mockOn, subscribe: mockSubscribe });
  });

  it('does not subscribe when userId is null', () => {
    renderHook(() => useMissionsRealtime(null, vi.fn()));
    expect(mockChannel).not.toHaveBeenCalled();
  });

  it('creates channel with correct userId', () => {
    renderHook(() => useMissionsRealtime('user-123', vi.fn()));
    expect(mockChannel).toHaveBeenCalledWith('missions:user-123', { config: { private: true } });
  });

  it('subscribes on mount', () => {
    renderHook(() => useMissionsRealtime('user-123', vi.fn()));
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('calls removeChannel on unmount', () => {
    const { unmount } = renderHook(() => useMissionsRealtime('user-123', vi.fn()));
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });
});
