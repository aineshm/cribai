'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@campusnest/supabase/client';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Mail, ArrowLeft } from 'lucide-react';
import { OTPInput } from './OTPInput';
import { ProfileSetup } from './ProfileSetup';
import { trackEvent } from '@/lib/track-event';

type AuthStep = 'email' | 'otp' | 'profile';

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 200, damping: 25 },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
    transition: { duration: 0.2, ease: 'easeIn' as const },
  }),
};

function getSafeReturnTo(searchParams: ReturnType<typeof useSearchParams>): string {
  const returnTo = searchParams.get('returnTo');
  return returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/explore';
}

export function AuthForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [step, setStep] = useState<AuthStep>('email');
  const [direction, setDirection] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const goToStep = useCallback((next: AuthStep, dir: number = 1) => {
    setDirection(dir);
    setError(null);
    setStep(next);
  }, []);

  const sendOtpEmail = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/validate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const validation: { allowed: boolean; error?: string } = await res.json();

      if (!validation.allowed) {
        setError(validation.error ?? 'CribAI requires a .edu email address');
        setLoading(false);
        return;
      }
    } catch {
      setError('Unable to validate email. Please try again.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    goToStep('otp');
    setResendCooldown(30);
  }, [email, goToStep]);

  const handleVerifyOtp = useCallback(async () => {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      let profile:
        | {
            readonly display_name?: string | null;
            readonly profile_completed_at?: string | null;
          }
        | null
        | undefined;

      try {
        const profileQuery = supabase
          .from('profiles')
          .select('display_name, profile_completed_at')
          .eq('id', user.id);

        if ('maybeSingle' in profileQuery && typeof profileQuery.maybeSingle === 'function') {
          const { data } = await profileQuery.maybeSingle();
          profile = data;
        }
      } catch {
        profile = null;
      }

      if (profile?.display_name || profile?.profile_completed_at) {
        toast.success('Signed in successfully!');
        setLoading(false);
        router.push(getSafeReturnTo(searchParams));
        return;
      }
    }

    toast.success('Signed in successfully!');
    setLoading(false);
    goToStep('profile');
  }, [email, otp, goToStep, router, searchParams]);

  // Auto-verify when OTP is complete (8 digits — Supabase project setting)
  const autoVerifiedRef = useRef(false);
  useEffect(() => {
    if (step === 'otp' && otp.length === 8 && !loading && !autoVerifiedRef.current) {
      autoVerifiedRef.current = true;
      handleVerifyOtp();
    }
    if (otp.length < 8) {
      autoVerifiedRef.current = false;
    }
  }, [otp, step, loading, handleVerifyOtp]);

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendOtpEmail();
  }

  function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleVerifyOtp();
  }

  const handleProfileComplete = useCallback(async (profile: {
    firstName: string;
    university: string;
    graduationYear: string;
  }) => {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        full_name: profile.firstName,
        university: profile.university,
        graduation_year: profile.graduationYear,
      },
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // Also write to profiles table so layout's isProfileIncomplete check passes
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error: profileError } = await supabase.from('profiles').update({
        display_name: profile.firstName,
        graduation_year: profile.graduationYear ? parseInt(profile.graduationYear) : null,
        profile_completed_at: new Date().toISOString(),
      }).eq('id', user.id);

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }
    }

    trackEvent('signup_completed');
    router.push(getSafeReturnTo(searchParams));
  }, [searchParams, router]);

  return (
    <div className="w-full max-w-sm">
      {error && (
        <div data-testid="auth-error" className="mb-4 rounded-lg bg-[var(--fair-bad-bg)] p-3 text-sm text-[var(--fair-bad)]">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait" custom={direction}>
        {step === 'email' && (
          <motion.div
            key="email"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <div className="mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary-50)] text-[var(--primary-600)] mb-4">
                <Mail className="h-6 w-6" />
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--surface-900)]">
                Sign in to CribAI
              </h2>
              <p className="mt-2 text-sm text-[var(--surface-500)]">
                Enter your .edu email and we&apos;ll send you a verification code.
              </p>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <Input
                aria-label="Email address"
                type="email"
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="h-10"
              />
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-10 rounded-lg bg-[var(--primary-600)] text-white hover:bg-[var(--primary-700)]"
              >
                {loading ? 'Sending code...' : 'Continue'}
              </Button>
            </form>
          </motion.div>
        )}

        {step === 'otp' && (
          <motion.div
            key="otp"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <button
              type="button"
              onClick={() => {
                setOtp('');
                goToStep('email', -1);
              }}
              className="flex items-center gap-1 text-sm text-[var(--surface-400)] hover:text-[var(--surface-600)] transition-colors mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="mb-6">
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--surface-900)]">
                Enter your code
              </h2>
              <p className="mt-2 text-sm text-[var(--surface-500)]">
                We sent an 8-digit code to{' '}
                <strong className="text-[var(--surface-700)]">{email}</strong>
              </p>
            </div>

            <form onSubmit={handleOtpSubmit} className="space-y-5">
              <OTPInput
                value={otp}
                onChange={setOtp}
                length={8}
                disabled={loading}
              />
              <motion.div
                initial={{ opacity: 0.7, y: 0 }}
                animate={{
                  opacity: otp.length === 8 ? 1 : 0.7,
                  scale: otp.length === 8 ? 1 : 0.98,
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              >
                <Button
                  type="submit"
                  disabled={loading || otp.length < 8}
                  className="w-full h-10 rounded-lg bg-[var(--primary-600)] text-white hover:bg-[var(--primary-700)]"
                >
                  {loading ? (
                    <motion.span
                      key="verifying"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2"
                    >
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                        className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                      />
                      Verifying...
                    </motion.span>
                  ) : (
                    <motion.span
                      key="verify"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      Verify Code
                    </motion.span>
                  )}
                </Button>
              </motion.div>
            </form>

            <button
              type="button"
              onClick={() => {
                setError(null);
                sendOtpEmail();
              }}
              disabled={loading || resendCooldown > 0}
              className="mt-4 w-full text-sm text-[var(--primary-600)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : 'Resend code'}
            </button>
          </motion.div>
        )}

        {step === 'profile' && (
          <motion.div
            key="profile"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <ProfileSetup
              email={email}
              onComplete={handleProfileComplete}
              loading={loading}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
