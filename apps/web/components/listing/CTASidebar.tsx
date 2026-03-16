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
  const { setOpen: openChat, setDraftPrompt } = useChatContext();
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
        <Card className="overflow-hidden rounded-[1.75rem] border border-[var(--surface-200)] bg-white shadow-[0_20px_48px_rgba(15,23,42,0.08)]">
          <div className="bg-[linear-gradient(135deg,#0f766e_0%,#115e59_42%,#f59e0b_160%)] px-5 py-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
              Ready to move fast?
            </p>
            <p className="mt-2 text-sm leading-6 text-white/90">
              Save it, ask CampusNest AI for lease context, or request a tour.
            </p>
          </div>
          <CardContent className="space-y-4 p-5">
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
              className="h-11 w-full rounded-xl bg-teal-800 hover:bg-teal-900"
              onClick={() => setTourModalOpen(true)}
            >
              <Calendar className="size-4" />
              Book a Tour
            </Button>

            {/* Secondary CTA */}
            <Button
              variant="outline"
              className="h-11 w-full rounded-xl border-teal-200 text-teal-800 hover:bg-teal-50"
              onClick={() => {
                setDraftPrompt(`Tell me about ${listingTitle} at ${listingAddress}.`);
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
