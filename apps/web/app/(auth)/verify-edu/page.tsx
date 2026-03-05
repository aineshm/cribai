'use client';

import { useState } from 'react';
import { createClient } from '@campusnest/supabase/client';
import Link from 'next/link';

type VerifyResult = {
  readonly verified: boolean;
  readonly campusName?: string;
  readonly message?: string;
};

export default function VerifyEduPage() {
  const [eduEmail, setEduEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError('You must be signed in to verify your .edu email.');
      setLoading(false);
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      setError('Configuration error.');
      setLoading(false);
      return;
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/verify-edu`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ eduEmail }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? 'Verification failed. Please try again.');
      return;
    }

    const data = await res.json();
    setResult({
      verified: true,
      campusName: data.campusName,
      message: data.message,
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-[var(--shadow-card)] animate-fade-in">
        <Link href="/" className="text-sm text-[var(--surface-400)] hover:text-[var(--surface-600)] transition-colors">
          &larr; Back
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl text-[var(--surface-900)]">Verify .edu Email</h1>
        <p className="mt-2 text-sm text-[var(--surface-500)]">
          Verify your .edu email to unlock full access — reviews, AI features,
          and more.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-[var(--fair-bad-bg)] p-3 text-sm text-[var(--fair-bad)]">
            {error}
          </div>
        )}

        {result?.verified && (
          <div className="mt-4 rounded-lg bg-[var(--fair-good-bg)] p-3 text-sm text-[var(--fair-good)]">
            Verified! {result.campusName && `Campus: ${result.campusName}`}
            {result.message && ` — ${result.message}`}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            placeholder="you@university.edu"
            value={eduEmail}
            onChange={(e) => setEduEmail(e.target.value)}
            required
            pattern=".+\\.edu$"
            title="Must be a .edu email address"
            className="w-full rounded-xl border border-[var(--surface-200)] px-4 py-3 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)] transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Verifying...' : 'Verify my .edu email'}
          </button>
        </form>
      </div>
    </main>
  );
}
