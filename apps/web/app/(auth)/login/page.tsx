'use client';

import { useState } from 'react';
import { createClient } from '@campusnest/supabase/client';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/callback`,
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-sm text-center animate-fade-in">
          <div className="text-4xl mb-4">✉️</div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--surface-900)]">Check your email</h1>
          <p className="mt-2 text-sm text-[var(--surface-500)]">
            We sent a magic link to <strong>{email}</strong>. Click the link to
            sign in.
          </p>
          <button
            onClick={() => setSent(false)}
            className="mt-6 text-sm text-[var(--primary-600)] hover:underline"
          >
            Use a different email
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-[var(--shadow-card)] animate-fade-in">
        <Link href="/" className="text-sm text-[var(--surface-400)] hover:text-[var(--surface-600)] transition-colors">
          &larr; Back
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl text-[var(--surface-900)]">Sign in to CampusNest</h1>
        <p className="mt-2 text-sm text-[var(--surface-500)]">
          Enter your email and we&apos;ll send you a magic link. Use a .edu
          email for full access.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-[var(--fair-bad-bg)] p-3 text-sm text-[var(--fair-bad)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-[var(--surface-200)] px-4 py-3 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)] transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[var(--primary-600)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--primary-700)] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Sending link...' : 'Send magic link'}
          </button>
        </form>
      </div>
    </main>
  );
}
