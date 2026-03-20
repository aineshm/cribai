'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { slideInFromBottom } from '@/lib/animations';
import { BookTourModal } from './BookTourModal';
import { useChatContext } from '@/components/chat/ChatProvider';

interface MobileBottomBarProps {
  readonly price: number;
  readonly listingTitle: string;
  readonly listingAddress: string;
  readonly listingId: string;
  readonly campusSlug?: string;
}

export function MobileBottomBar({
  price,
  listingTitle,
  listingAddress,
  listingId,
  campusSlug,
}: MobileBottomBarProps) {
  const [tourModalOpen, setTourModalOpen] = useState(false);
  const { setOpen: openChat, setDraftPrompt, setDraftListingId } = useChatContext();

  return (
    <>
      <motion.div
        className="safe-area-pb fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--surface-200)] bg-white/94 px-4 py-3 backdrop-blur-md md:hidden"
        variants={slideInFromBottom}
        initial="initial"
        animate="animate"
      >
        <div className="flex items-center gap-3 rounded-[1.5rem] border border-[var(--surface-200)] bg-white px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
          {/* Price */}
          <div className="flex-1 min-w-0">
            <span className="text-lg font-bold text-foreground font-[family-name:var(--font-display)]">
              ${price.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">/mo</span>
          </div>

          {/* Action Buttons */}
          <Button
            size="sm"
            className="rounded-xl bg-teal-800 hover:bg-teal-900"
            onClick={() => setTourModalOpen(true)}
          >
            <Calendar className="size-4" />
            Book Tour
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-teal-200 text-teal-800 hover:bg-teal-50"
            onClick={() => {
              setDraftPrompt(`Tell me about ${listingTitle} at ${listingAddress}.`);
              setDraftListingId(listingId);
              openChat(true);
            }}
          >
            <MessageCircle className="size-4" />
            Chat
          </Button>
        </div>
      </motion.div>

      <BookTourModal
        isOpen={tourModalOpen}
        onClose={() => setTourModalOpen(false)}
        listingId={listingId}
        listingTitle={listingTitle}
        listingAddress={listingAddress}
        campusSlug={campusSlug}
      />
    </>
  );
}
