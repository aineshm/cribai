'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { Mission } from '@/lib/concierge-types';
import { mockMissions } from '@/lib/mock-missions';

interface ConciergeContextValue {
  readonly missions: readonly Mission[];
  readonly selectedMission: Mission | null;
  readonly isOpen: boolean;
  readonly openSidebar: () => void;
  readonly closeSidebar: () => void;
  readonly selectMission: (mission: Mission | null) => void;
  readonly addMission: (mission: Mission) => void;
}

const ConciergeContext = createContext<ConciergeContextValue | null>(null);

export function ConciergeProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [missions, setMissions] = useState<readonly Mission[]>(mockMissions);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openSidebar = useCallback(() => setIsOpen(true), []);
  const closeSidebar = useCallback(() => {
    setIsOpen(false);
    setSelectedMission(null);
  }, []);

  const selectMission = useCallback(
    (mission: Mission | null) => setSelectedMission(mission),
    []
  );

  const addMission = useCallback(
    (mission: Mission) =>
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
