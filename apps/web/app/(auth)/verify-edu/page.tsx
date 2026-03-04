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
      <div className="w-full max-w-sm">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Verify .edu Email</h1>
        <p className="mt-2 text-sm text-gray-600">
          Verify your .edu email to unlock full access — reviews, AI features,
          and more.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result?.verified && (
          <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
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
            className="w-full rounded-lg border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify my .edu email'}
          </button>
        </form>
      </div>
    </main>
  );
}
