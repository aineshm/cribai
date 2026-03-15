'use client';

import { Sparkles, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useChatContext } from './ChatProvider';
import { CribAIChat } from '../cribai-chat';

/**
 * AIChatPanel — thin Sheet wrapper around CribAIChat.
 *
 * All message rendering, streaming, input handling, and conversation
 * persistence live inside CribAIChat. This component only manages
 * the Sheet open/close state via ChatProvider.
 */
export function AIChatPanel() {
  const { open, setOpen, campusSlug } = useChatContext();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-md flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <SheetHeader className="border-b px-4 py-3 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-full bg-[var(--primary-700)] flex items-center justify-center">
              <Sparkles className="size-4 text-white" />
            </div>
            <SheetTitle className="text-base font-semibold">
              CribAI
            </SheetTitle>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close chat panel"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>

        {/* CribAIChat fills the remaining space */}
        <div className="flex-1 overflow-hidden">
          <CribAIChat
            campusSlug={campusSlug || 'uw-madison'}
            className="flex h-full flex-col bg-white"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
