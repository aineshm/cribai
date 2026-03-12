/**
 * Supabase Realtime subscription for mission updates.
 *
 * Subscribes to a single channel per user watching missions, mission_logs,
 * and mission_drafts tables. Uses {config: {private: true}} to enforce RLS.
 * One channel per user (not per mission) — respects 200 concurrent limit.
 */
'use client';

import { useEffect, useCallback } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@campusnest/supabase/client';

export type RealtimeChangeHandler = (
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
) => void;

export function useMissionsRealtime(
  userId: string | null,
  onChange: RealtimeChangeHandler
): void {
  // onChange must be stable — caller should wrap with useCallback
  const stableOnChange = useCallback(onChange, [onChange]);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`missions:${userId}`, { config: { private: true } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'missions', filter: `user_id=eq.${userId}` },
        stableOnChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mission_logs' },
        stableOnChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mission_drafts' },
        stableOnChange
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, stableOnChange]);
}
