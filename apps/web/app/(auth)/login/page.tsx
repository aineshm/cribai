'use client';

import { useState } from 'react';
import { createClient } from '@campusnest/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';
import { isEduEmail } from '@/lib/edu-validation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isEduEmail(email)) {
      setError('CampusNest requires a .edu email address');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setStep('otp');
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });

    setLoading(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    toast.success('Signed in successfully!');
    window.location.href = '/uw-madison/cribai';
  }

  if (step === 'otp') {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-[var(--shadow-card)] animate-fade-in">
          <button
            onClick={() => { setStep('email'); setOtp(''); setError(null); }}
            className="text-sm text-[var(--surface-400)] hover:text-[var(--surface-600)] transition-colors"
          >
            &larr; Back
          </button>
          <div className="mt-4 text-center">
            <div className="text-4xl mb-4">🔑</div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--surface-900)]">Enter your code</h1>
            <p className="mt-2 text-sm text-[var(--surface-500)]">
              We sent an 8-digit code to <strong>{email}</strong>
            </p>
          </div>

          {error && (
            <div data-testid="error-message" className="mt-4 rounded-lg bg-[var(--fair-bad-bg)] p-3 text-sm text-[var(--fair-bad)]">
              {error}
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              placeholder="00000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
              className="w-full rounded-xl border border-[var(--surface-200)] px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)] transition-colors"
            />
            <button
              type="submit"
              disabled={loading || otp.length < 8}
              className="w-full rounded-xl bg-[var(--primary-600)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--primary-700)] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify code'}
            </button>
          </form>

          <button
            onClick={() => { setError(null); handleSendOtp(new Event('submit') as unknown as React.FormEvent); }}
            className="mt-4 w-full text-sm text-[var(--primary-600)] hover:underline"
          >
            Resend code
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
          Enter your .edu email and we&apos;ll send you a verification code.
        </p>

        {error && (
          <div data-testid="error-message" className="mt-4 rounded-lg bg-[var(--fair-bad-bg)] p-3 text-sm text-[var(--fair-bad)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSendOtp} className="mt-6 space-y-4">
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
            {loading ? 'Sending code...' : 'Send verification code'}
          </button>
        </form>
      </div>
    </main>
  );
}
