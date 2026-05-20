'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useChatContext } from './ChatProvider';
import { MissionProposalCard } from './MissionProposalCard';
import { CribAIChat } from '../cribai-chat';

/**
 * AIChatPanel — thin Sheet wrapper around CribAIChat.
 *
 * All message rendering, streaming, input handling, and conversation
 * persistence live inside CribAIChat. This component only manages
 * the Sheet open/close state via ChatProvider and wires mission
 * proposals from CribAIChat's SSE back to ChatProvider.
 */
export function AIChatPanel() {
  const pathname = usePathname();
  const {
    open,
    setOpen,
    campusSlug,
    campusId,
    isAuthenticated,
    pendingProposal,
    draftPrompt,
    draftListingId,
    setPendingProposal,
    clearDraftPrompt,
  } = useChatContext();

  const handleMissionProposal = useCallback(
    (proposal: { intent: string; confidence: number; extractedFields: Record<string, unknown> }) => {
      setPendingProposal(proposal);
    },
    [setPendingProposal],
  );

  // Hide on pages that embed their own chat/missions UI
  const hiddenPaths = ['/explore', '/messages', '/chat'];
  if (hiddenPaths.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-md flex flex-col p-0 gap-0 backdrop-blur-[16px] bg-white/80 border-l border-white/20 shadow-[-10px_0_40px_rgba(0,0,0,0.06)]"
      >
        {/* Header */}
        <SheetHeader className="border-b border-gray-100/50 bg-white/40 px-4 py-3 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-gradient-to-br from-[hsl(356,80%,32%)] to-[hsl(356,80%,18%)] flex items-center justify-center shadow-md shadow-red-900/10">
              <Sparkles className="size-4 text-white" />
            </div>
            <div className="flex flex-col">
              <SheetTitle className="text-base font-bold bg-gradient-to-r from-[hsl(356,80%,32%)] to-[hsl(356,80%,18%)] bg-clip-text text-transparent leading-none">
                CribAI
              </SheetTitle>
              <span className="text-[9px] text-gray-400 font-semibold tracking-wider uppercase mt-0.5">UW-Madison Companion</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close chat panel"
            className="size-8 rounded-full hover:bg-gray-100/80 transition-all flex items-center justify-center text-gray-400 hover:text-gray-700"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>

        {/* Mission proposal card (if any) */}
        {pendingProposal && (
          <div className="border-b px-4 py-3">
            <MissionProposalCard />
          </div>
        )}

        {/* CribAIChat fills the remaining space */}
        <div className="flex-1 overflow-hidden">
          <CribAIChat
            campusSlug={campusSlug || 'uw-madison'}
            campusId={campusId}
            isAuthenticated={isAuthenticated}
            onMissionProposal={handleMissionProposal}
            inputSeed={draftPrompt}
            listingIdSeed={draftListingId}
            onInputSeedConsumed={clearDraftPrompt}
            className="flex h-full flex-col bg-transparent"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
