'use client';

import { useState } from 'react';
import { createClient } from '@campusnest/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AuthNavProps {
  readonly userEmail: string | null;
  readonly isEduVerified: boolean;
}

export function AuthNav({ userEmail, isEduVerified }: AuthNavProps) {
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
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
          className="text-xs text-orange-600 hover:underline"
        >
          Verify .edu
        </Link>
      )}
      <span className="text-sm text-gray-600">{userEmail}</span>
      <button
        onClick={handleSignOut}
        disabled={loading}
        className="rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
