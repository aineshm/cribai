'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@campusnest/supabase/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

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
        setTimeout(() => setAnimating(false), 300);
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
        toast.success('Saved to favorites');
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
        toast.success('Removed from favorites');
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
      <svg
        className={`${iconSize} transition-transform duration-200 ${animating ? 'animate-heart-pop' : ''}`}
        fill={saved ? '#ef4444' : 'none'}
        stroke={saved ? '#ef4444' : variant === 'overlay' ? 'white' : 'currentColor'}
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
    </button>
  );
}
