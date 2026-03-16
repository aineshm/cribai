/**
 * Supabase Realtime subscription for mission updates.
 *
 * Subscribes to a single channel per user watching missions, mission_logs,
 * and mission_drafts tables. Uses {config: {private: true}} to enforce RLS.
 * One channel per user (not per mission) — respects 200 concurrent limit.
 *
 * After the subscription is established, fires `onResubscribe` so the caller
 * can re-fetch current state — this closes the gap between unmount (old
 * subscription torn down) and remount (new subscription established).
 */
'use client';

import { useEffect } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@campusnest/supabase/client';

export type RealtimeChangeHandler = (
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
) => void;

export function useMissionsRealtime(
  userId: string | null,
  onChange: RealtimeChangeHandler,
  onResubscribe?: () => void,
): void {
  useEffect(() => {
    if (!userId) return;

    const handleResubscribe = onResubscribe ?? (() => {});
    const supabase = createClient();
    const channel = supabase
      .channel(`missions:${userId}`, { config: { private: true } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'missions', filter: `user_id=eq.${userId}` },
        onChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mission_logs' },
        onChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mission_drafts' },
        onChange
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Channel is live — fetch current state to close the gap
          // between the old subscription teardown and this new one.
          handleResubscribe();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, onChange, onResubscribe]);
}
