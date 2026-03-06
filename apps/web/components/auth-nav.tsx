'use client';

import { useState } from 'react';
import { createClient } from '@campusnest/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AuthNavProps {
  readonly userEmail: string | null;
  readonly isEduVerified: boolean;
  readonly campusSlug?: string;
  readonly priceChangedSavesCount?: number;
}

export function AuthNav({ userEmail, isEduVerified, campusSlug, priceChangedSavesCount = 0 }: AuthNavProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  if (!userEmail) {
    return (
      <Link
        href="/login"
        className="rounded-lg bg-[var(--primary-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-700)] transition-colors"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {!isEduVerified && (
        <Link
          href="/verify-edu"
          className="text-xs text-[var(--secondary-600)] hover:underline"
        >
          Verify .edu
        </Link>
      )}
      <Link
        href="/settings/profile"
        className="text-xs text-[var(--surface-500)] hover:text-[var(--surface-800)] hover:underline transition-colors"
      >
        Settings
      </Link>
      <span className="text-sm text-[var(--surface-500)]">{userEmail}</span>
      <button
        onClick={handleSignOut}
        disabled={loading}
        className="rounded-lg border border-[var(--surface-200)] px-3 py-1.5 text-sm text-[var(--surface-600)] hover:bg-[var(--surface-100)] disabled:opacity-50 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
