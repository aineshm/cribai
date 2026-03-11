'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { slideInFromBottom } from '@/lib/animations';
import { BookTourModal } from './BookTourModal';

interface MobileBottomBarProps {
  readonly price: number;
  readonly listingTitle: string;
}

export function MobileBottomBar({ price, listingTitle }: MobileBottomBarProps) {
  const [tourModalOpen, setTourModalOpen] = useState(false);

  return (
    <>
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-background/95 backdrop-blur-md border-t border-[var(--surface-200)] px-4 py-3"
        variants={slideInFromBottom}
        initial="initial"
        animate="animate"
      >
        <div className="flex items-center gap-3">
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
            onClick={() => setTourModalOpen(true)}
          >
            <Calendar className="size-4" />
            Book Tour
          </Button>
          <Button variant="outline" size="sm" disabled title="Coming soon">
            <MessageCircle className="size-4" />
            Chat
          </Button>
        </div>
      </motion.div>

      <BookTourModal
        isOpen={tourModalOpen}
        onClose={() => setTourModalOpen(false)}
        listingTitle={listingTitle}
      />
    </>
  );
}
