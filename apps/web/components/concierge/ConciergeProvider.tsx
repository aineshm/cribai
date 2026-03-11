'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { LegacyMission } from '@/lib/concierge-types';
import { mockMissions } from '@/lib/mock-missions';

interface ConciergeContextValue {
  readonly missions: readonly LegacyMission[];
  readonly selectedMission: LegacyMission | null;
  readonly isOpen: boolean;
  readonly openSidebar: () => void;
  readonly closeSidebar: () => void;
  readonly selectMission: (mission: LegacyMission | null) => void;
  readonly addMission: (mission: LegacyMission) => void;
}

const ConciergeContext = createContext<ConciergeContextValue | null>(null);

export function ConciergeProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [missions, setMissions] = useState<readonly LegacyMission[]>(mockMissions);
  const [selectedMission, setSelectedMission] = useState<LegacyMission | null>(null);
  const [isOpen, setIsOpen] = useState(false);

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
    (mission: LegacyMission) =>
      setMissions((prev) => [mission, ...prev]),
    []
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
    }),
    [missions, selectedMission, isOpen, openSidebar, closeSidebar, selectMission, addMission]
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
