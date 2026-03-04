'use client';

import { createContext, useContext } from 'react';
import type { CampusConfig } from '@campusnest/types';

const CampusContext = createContext<CampusConfig | null>(null);

export function CampusProvider({
  campus,
  children,
}: {
  readonly campus: CampusConfig;
  readonly children: React.ReactNode;
}) {
  return (
    <CampusContext.Provider value={campus}>{children}</CampusContext.Provider>
  );
}

export function useCampus(): CampusConfig {
  const ctx = useContext(CampusContext);
  if (!ctx) {
    throw new Error('useCampus must be used within a CampusProvider');
  }
  return ctx;
}
