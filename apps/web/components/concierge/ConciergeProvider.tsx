'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { LegacyMission } from '@/lib/concierge-types';
import { createClient } from '@campusnest/supabase/client';
import { useMissionsRealtime } from '@/hooks/use-missions-realtime';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Polling interval (ms) when active missions exist. */
const ACTIVE_POLL_INTERVAL_MS = 12_000;

/** Mission statuses that indicate work is still in progress. */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'running',
  'waiting_approval',
]);

// ─── DB mission shape returned by GET /api/missions ──────────────────────────
// Mirrors the fields selected by the API route (snake_case).

interface DbMission {
  readonly id: string;
  readonly type: LegacyMission['type'];
  readonly title: string;
  readonly status: LegacyMission['status'];
  readonly goal: string;
  readonly current_step_index: number;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Maps a DB-shaped mission row to the LegacyMission UI shape.
 * Plan 29-04 will migrate to MissionWithDetails and remove this mapping.
 */
function dbMissionToLegacy(m: DbMission): LegacyMission {
  return {
    id: m.id,
    type: m.type,
    title: m.title,
    status: m.status,
    listingTitle: '',
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    summary: m.goal,
    logs: [],
    actionCard: undefined,
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ConciergeContextValue {
  readonly missions: readonly LegacyMission[];
  readonly selectedMission: LegacyMission | null;
  readonly isOpen: boolean;
  readonly openSidebar: () => void;
  readonly closeSidebar: () => void;
  readonly selectMission: (mission: LegacyMission | null) => void;
  readonly addMission: (mission: LegacyMission) => void;
  /** Open the sidebar to a specific mission by id, or just open if not found. */
  readonly openToMission: (missionId: string) => void;
}

const ConciergeContext = createContext<ConciergeContextValue | null>(null);

export function ConciergeProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [missions, setMissions] = useState<readonly LegacyMission[]>([]);
  const [selectedMission, setSelectedMission] = useState<LegacyMission | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Track mount count so we always fetch on every mount, not just the first
  const mountCountRef = useRef(0);

  // ─── Reusable fetch function ────────────────────────────────────────────────
  const fetchMissions = useCallback(async (signal?: AbortSignal) => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (signal?.aborted || !session) return;

      setUserId(session.user.id);
      const res = await fetch('/api/missions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { missions: DbMission[] };
      if (!signal?.aborted) {
        setMissions(body.missions.map(dbMissionToLegacy));
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== 'AbortError') {
        console.error('[ConciergeProvider] Failed to fetch missions:', err);
      }
    }
  }, []);

  // ─── Fetch missions on every mount ──────────────────────────────────────────
  useEffect(() => {
    mountCountRef.current += 1;
    const controller = new AbortController();
    void fetchMissions(controller.signal);
    return () => controller.abort();
  }, [fetchMissions]);

  // ─── Re-fetch when tab becomes visible (handles background navigation) ─────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchMissions();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchMissions]);

  // ─── Polling fallback for active missions ──────────────────────────────────
  // When any mission is pending/running/waiting_approval, poll periodically
  // to catch updates that Realtime may have missed.
  useEffect(() => {
    const hasActiveMissions = missions.some(m => ACTIVE_STATUSES.has(m.status));
    if (!hasActiveMissions) return;

    const intervalId = setInterval(() => {
      void fetchMissions();
    }, ACTIVE_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [missions, fetchMissions]);

  // ─── Realtime handler ───────────────────────────────────────────────────────
  const handleRealtimeChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.table === 'missions') {
        if (payload.eventType === 'INSERT') {
          const m = dbMissionToLegacy(payload.new as unknown as DbMission);
          setMissions(prev => [m, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          const updated = dbMissionToLegacy(payload.new as unknown as DbMission);
          setMissions(prev =>
            prev.map(existing => (existing.id === updated.id ? updated : existing))
          );
        } else if (payload.eventType === 'DELETE') {
          const deletedId = (payload.old as unknown as { id?: string }).id;
          setMissions(prev => prev.filter(m => m.id !== deletedId));
        }
      }
    },
    []
  );

  // Re-fetch when Realtime re-subscribes to close the gap between teardown
  // of the old subscription and establishment of the new one.
  const handleResubscribe = useCallback(() => {
    void fetchMissions();
  }, [fetchMissions]);

  useMissionsRealtime(userId, handleRealtimeChange, handleResubscribe);

  // ─── Sidebar controls ───────────────────────────────────────────────────────
  const openSidebar = useCallback(() => setIsOpen(true), []);
  const closeSidebar = useCallback(() => {
    setIsOpen(false);
    setSelectedMission(null);
  }, []);

  // ─── Fetch mission detail (logs + draft) on selection ────────────────────
  const fetchMissionDetail = useCallback(async (missionId: string) => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/missions/${missionId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;

      const body = (await res.json()) as {
        mission: Record<string, unknown>;
        logs: readonly { created_at: string; status: string; step_name: string; message?: string }[];
        currentDraft: Record<string, unknown> | null;
      };

      // Map DB logs to LegacyMission ExecutionLog shape
      const mappedLogs = (body.logs ?? []).map(log => ({
        timestamp: log.created_at,
        action: log.step_name ?? 'step',
        detail: log.message ?? '',
        status: (log.status === 'completed' ? 'success' : log.status === 'failed' ? 'error' : 'pending') as 'success' | 'pending' | 'error',
      }));

      // Enrich the selected mission with real logs
      setSelectedMission(prev => prev?.id === missionId ? { ...prev, logs: mappedLogs } : prev);
    } catch (err) {
      console.error('[ConciergeProvider] Failed to fetch mission detail:', err);
    }
  }, []);

  const selectMission = useCallback(
    (mission: LegacyMission | null) => {
      setSelectedMission(mission);
      if (mission) {
        void fetchMissionDetail(mission.id);
      }
    },
    [fetchMissionDetail]
  );

  const addMission = useCallback(
    (mission: LegacyMission) => setMissions(prev => [mission, ...prev]),
    []
  );

  const openToMission = useCallback(
    (missionId: string) => {
      setIsOpen(true);
      const mission = missions.find(m => m.id === missionId);
      if (mission) {
        setSelectedMission(mission);
      }
      // If mission not found in local list, sidebar opens to the list view
    },
    [missions]
  );

  const value = useMemo<ConciergeContextValue>(
    () => ({
      missions,
      selectedMission,
      isOpen,
      openSidebar,
      closeSidebar,
      selectMission,
      addMission,
      openToMission,
    }),
    [missions, selectedMission, isOpen, openSidebar, closeSidebar, selectMission, addMission, openToMission]
  );

  return (
    <ConciergeContext.Provider value={value}>
      {children}
    </ConciergeContext.Provider>
  );
}

export function useConcierge(): ConciergeContextValue {
  const context = useContext(ConciergeContext);
  if (!context) {
    throw new Error('useConcierge must be used within a ConciergeProvider');
  }
  return context;
}
