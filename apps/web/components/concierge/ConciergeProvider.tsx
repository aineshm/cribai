'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { LegacyMission } from '@/lib/concierge-types';
import { createClient } from '@campusnest/supabase/client';
import { useMissionsRealtime } from '@/hooks/use-missions-realtime';

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

  // ─── Fetch missions on mount ────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (controller.signal.aborted || !session) return;
      setUserId(session.user.id);
      fetch('/api/missions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
      })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data: { missions: DbMission[] }) => {
          if (!controller.signal.aborted) {
            setMissions(data.missions.map(dbMissionToLegacy));
          }
        })
        .catch((err: unknown) => {
          if ((err as { name?: string }).name !== 'AbortError') {
            console.error('[ConciergeProvider] Failed to fetch missions:', err);
          }
        });
    }).catch((err: unknown) => {
      console.error('[ConciergeProvider] getSession failed:', err);
    });

    return () => controller.abort();
  }, []);

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

  useMissionsRealtime(userId, handleRealtimeChange);

  // ─── Sidebar controls ───────────────────────────────────────────────────────
  const openSidebar = useCallback(() => setIsOpen(true), []);
  const closeSidebar = useCallback(() => {
    setIsOpen(false);
    setSelectedMission(null);
  }, []);

  const selectMission = useCallback(
    (mission: LegacyMission | null) => setSelectedMission(mission),
    []
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
