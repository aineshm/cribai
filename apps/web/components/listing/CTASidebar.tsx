'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Share2, Calendar, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { slideInFromRight } from '@/lib/animations';
import { BookTourModal } from './BookTourModal';

interface CTASidebarProps {
  readonly price: number;
  readonly listingTitle: string;
}

export function CTASidebar({ price, listingTitle }: CTASidebarProps) {
  const [saved, setSaved] = useState(false);
  const [tourModalOpen, setTourModalOpen] = useState(false);

  return (
    <>
      <motion.div
        className="sticky top-20"
        variants={slideInFromRight}
        initial="initial"
        animate="animate"
      >
        <Card>
          <CardContent className="space-y-4">
            {/* Price */}
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground font-[family-name:var(--font-display)]">
                  ${price.toLocaleString()}
                </span>
                <span className="text-muted-foreground text-sm">/month</span>
              </div>
            </div>

            {/* Primary CTA */}
            <Button
              className="w-full h-10"
              onClick={() => setTourModalOpen(true)}
            >
              <Calendar className="size-4" />
              Book a Tour
            </Button>

            {/* Secondary CTA */}
            <Button
              variant="outline"
              className="w-full h-10"
              disabled
              title="Coming soon"
            >
              <MessageCircle className="size-4" />
              Ask AI About This Listing
            </Button>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSaved((prev) => !prev)}
              >
                <Heart
                  className={`size-4 ${
                    saved
                      ? 'fill-[var(--accent-500)] text-[var(--accent-500)]'
                      : ''
                  }`}
                />
                {saved ? 'Saved' : 'Save'}
              </Button>
              <Button variant="outline" className="flex-1" disabled title="Coming soon">
                <Share2 className="size-4" />
                Share
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <BookTourModal
        isOpen={tourModalOpen}
        onClose={() => setTourModalOpen(false)}
        listingTitle={listingTitle}
      />
    </>
  );
}
