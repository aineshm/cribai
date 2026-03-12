'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Check, Share2 } from 'lucide-react';

interface ShareButtonProps {
  readonly title: string;
  readonly url: string;
}

export function ShareButton({ title, url }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const absoluteUrl = new URL(url, window.location.origin).toString();
    const shareData = { title, url: absoluteUrl };

    // Use native share sheet on supported devices (mobile)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // User cancelled or share failed — fall through to clipboard
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    // Fallback: copy URL to clipboard
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [title, url]);

  return (
    <button
      onClick={handleShare}
      className="flex items-center justify-center gap-2 rounded-xl border border-[var(--surface-200)] bg-white px-5 py-3 text-sm font-medium text-[var(--surface-600)] shadow-sm hover:bg-[var(--surface-50)] transition-colors"
      aria-label="Share this listing"
    >
      {copied ? (
        <Check className="h-4 w-4 text-emerald-600" strokeWidth={2} />
      ) : (
        <Share2 className="h-4 w-4" strokeWidth={2} />
      )}
      {copied ? 'Copied!' : 'Share'}
    </button>
  );
}
