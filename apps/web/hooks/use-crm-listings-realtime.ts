/**
 * Supabase Realtime subscription for crm_listings changes (AIN-105).
 *
 * Mirrors use-missions-realtime.ts's per-user private channel idiom: one
 * channel per user (not per listing), `{config: {private: true}}` to enforce
 * RLS, filtered `user_id=eq.${userId}`.
 *
 * Unlike the missions hook, callers here (BoardView / CrmCanvas) don't patch
 * individual rows into local state from the payload — they just re-run their
 * existing `getList` + `listUnits` fetch. So this hook collapses "on change"
 * and "on resubscribe" into one debounced `onRefetch` callback: any
 * postgres_changes event, or the channel reaching SUBSCRIBED (which also
 * covers the initial subscribe and closes the resubscribe gap), schedules a
 * refetch ~400ms later. A trailing debounce so a burst of events for one save
 * (the INSERT, then the AIN-95 background nickname UPDATE ~0.2s later, plus
 * any deep-extract mission UPDATE) coalesces into a single refetch instead of
 * one per row change.
 */
'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@campusnest/supabase/client';

const DEFAULT_DEBOUNCE_MS = 400;

export function useCrmListingsRealtime(
  userId: string | null,
  onRefetch: () => void,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): void {
  // Always call the latest onRefetch without re-subscribing the channel when
  // the caller passes a fresh function identity on every render.
  const onRefetchRef = useRef(onRefetch);
  useEffect(() => {
    onRefetchRef.current = onRefetch;
  }, [onRefetch]);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefetch = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        onRefetchRef.current();
      }, debounceMs);
    };

    const channel = supabase
      .channel(`crm_listings:${userId}`, { config: { private: true } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_listings', filter: `user_id=eq.${userId}` },
        scheduleRefetch,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Channel is live — schedule a refetch to close the gap between
          // the old subscription's teardown and this new one (also covers
          // the very first mount).
          scheduleRefetch();
        }
      });

    return () => {
      if (timer !== null) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId, debounceMs]);
}
