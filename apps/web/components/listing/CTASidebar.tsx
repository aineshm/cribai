'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Share2, Calendar, MessageCircle } from 'lucide-react';
import { createClient } from '@campusnest/supabase/client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { slideInFromRight } from '@/lib/animations';
import { BookTourModal } from './BookTourModal';
import { useChatContext } from '@/components/chat/ChatProvider';

interface CTASidebarProps {
  readonly price: number;
  readonly listingTitle: string;
  readonly listingAddress: string;
  readonly listingId: string;
  readonly campusSlug?: string;
}

export function CTASidebar({
  price,
  listingTitle,
  listingAddress,
  listingId,
  campusSlug,
}: CTASidebarProps) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tourModalOpen, setTourModalOpen] = useState(false);
  const { setOpen: openChat, setDraftPrompt, setDraftListingId } = useChatContext();
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function loadSavedState() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const { data, error } = await supabase
        .from('saved_listings')
        .select('listing_id')
        .eq('listing_id', listingId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!active || error) {
        return;
      }

      setSaved(Boolean(data));
    }

    void loadSavedState();

    return () => {
      active = false;
    };
  }, [listingId]);

  async function handleSaveToggle() {
    if (saving) {
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const returnTo = campusSlug
        ? `/listing/${listingId}?campus=${encodeURIComponent(campusSlug)}`
        : `/listing/${listingId}`;
      router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      setSaving(false);
      return;
    }

    const nextSaved = !saved;
    setSaved(nextSaved);

    if (nextSaved) {
      const { error } = await supabase
        .from('saved_listings')
        .insert({ listing_id: listingId, user_id: user.id });

      if (error) {
        setSaved(false);
        toast.error('Could not save listing');
        setSaving(false);
        return;
      }

      toast.success('Added to Saved');
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('saved_listings')
      .delete()
      .eq('listing_id', listingId)
      .eq('user_id', user.id);

    if (error) {
      setSaved(true);
      toast.error('Could not remove from favorites');
      setSaving(false);
      return;
    }

    toast.success('Removed from Saved');
    setSaving(false);
  }

  return (
    <>
      <motion.div
        className="sticky top-20"
        variants={slideInFromRight}
        initial="initial"
        animate="animate"
      >
        <Card className="overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-lg">
          <CardContent className="space-y-5 p-0">
            {/* Price */}
            <div className="flex items-baseline gap-1">
              <span className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-foreground">
                ${price.toLocaleString()}
              </span>
              <span className="text-muted-foreground text-sm">/month</span>
            </div>

            {/* Primary CTA */}
            <Button
              className="h-12 w-full rounded-xl bg-teal-800 text-base font-bold shadow-lg hover:bg-teal-900"
              onClick={() => setTourModalOpen(true)}
            >
              <Calendar className="size-4" />
              Book a Tour
            </Button>

            {/* Secondary CTA — amber accent */}
            <Button
              className="h-12 w-full rounded-xl bg-amber-400 text-base font-bold text-amber-950 shadow-sm hover:bg-amber-500"
              onClick={() => {
                setDraftPrompt(`Tell me about this listing at ${listingAddress}.`);
                setDraftListingId(listingId);
                openChat(true);
              }}
            >
              <MessageCircle className="size-4" />
              Ask AI About This Listing
            </Button>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => void handleSaveToggle()}
                disabled={saving}
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
              <Button variant="outline" className="flex-1 rounded-xl" disabled title="Coming soon">
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
        listingId={listingId}
        listingTitle={listingTitle}
        listingAddress={listingAddress}
        campusSlug={campusSlug}
      />
    </>
  );
}
