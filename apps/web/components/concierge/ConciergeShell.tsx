'use client';

import { ConciergeProvider } from './ConciergeProvider';
import { ConciergeSidebar } from './ConciergeSidebar';

export function ConciergeShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <ConciergeProvider>
      {children}
      <ConciergeSidebar />
    </ConciergeProvider>
  );
}
