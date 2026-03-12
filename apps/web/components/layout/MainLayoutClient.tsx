'use client';

/**
 * MainLayoutClient — client bridge between ConciergeProvider and ChatProvider.
 *
 * Because layout.tsx is a server component, it cannot pass callbacks between
 * siblings. This component sits inside ConciergeShell (so it has access to
 * ConciergeContext) and wraps ChatProvider with onMissionCreated wired to
 * useConcierge().openToMission.
 */

import { useConcierge } from '@/components/concierge/ConciergeProvider';
import { ChatProvider } from '@/components/chat/ChatProvider';

interface MainLayoutClientProps {
  readonly children: React.ReactNode;
  readonly campusSlug: string;
}

export function MainLayoutClient({ children, campusSlug }: MainLayoutClientProps) {
  const { openToMission } = useConcierge();

  return (
    <ChatProvider campusSlug={campusSlug} onMissionCreated={openToMission}>
      {children}
    </ChatProvider>
  );
}
