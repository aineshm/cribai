'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@campusnest/supabase/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeartButtonProps {
  readonly listingId: string;
  readonly initialSaved: boolean;
  readonly campusSlug: string;
  readonly size?: 'sm' | 'md';
  readonly variant?: 'overlay' | 'inline';
}

export function HeartButton({
  listingId,
  initialSaved,
  campusSlug,
  size = 'sm',
  variant = 'overlay',
}: HeartButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [animating, setAnimating] = useState(false);
  const router = useRouter();
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up animation timer on unmount
  useEffect(() => {
    return () => {
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    };
  }, []);

  const iconSize = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  const padding = size === 'sm' ? 'p-1.5' : 'p-2';

  const handleToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(`/login?returnTo=/${campusSlug}/listings`);
        return;
      }

      const newState = !saved;
      setSaved(newState);

      if (newState) {
        setAnimating(true);
        if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
        animationTimerRef.current = setTimeout(() => setAnimating(false), 300);
      }

      if (newState) {
        const { error } = await supabase
          .from('saved_listings')
          .insert({ listing_id: listingId, user_id: user.id });

        if (error) {
          setSaved(false);
          toast.error('Could not save listing');
          return;
        }
        toast.success('Added to Saved');
      } else {
        const { error } = await supabase
          .from('saved_listings')
          .delete()
          .eq('listing_id', listingId)
          .eq('user_id', user.id);

        if (error) {
          setSaved(true);
          toast.error('Could not remove from favorites');
          return;
        }
        toast.success('Removed from Saved');
      }
    },
    [saved, listingId, campusSlug, router],
  );

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`${variant === 'overlay' ? 'absolute top-3 right-3 z-10 bg-black/20 backdrop-blur-sm hover:bg-black/30' : 'bg-[var(--surface-100)] hover:bg-[var(--surface-200)]'} ${padding} rounded-full transition-colors`}
      aria-label={saved ? 'Remove from favorites' : 'Save to favorites'}
    >
      <Heart
        className={cn(
          iconSize,
          'transition-transform duration-200',
          animating && 'animate-heart-pop',
          saved ? 'fill-red-500 stroke-red-500' : variant === 'overlay' ? 'stroke-white' : 'stroke-current'
        )}
        strokeWidth={2}
      />
    </button>
  );
}
