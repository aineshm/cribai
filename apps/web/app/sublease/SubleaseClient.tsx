'use client';

import Link from 'next/link';
import { Home } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SubleaseClientProps {
  readonly subleaseCount: number;
  readonly totalCount: number;
}

export function SubleaseClient({ subleaseCount, totalCount }: SubleaseClientProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface-50)]">
      {/* Nav header */}
      <nav className="flex items-center justify-between border-b border-[var(--surface-200)] bg-white px-6 py-3">
        <Link href="/" className="flex items-center gap-2 text-[var(--primary-700)] font-semibold">
          <Home className="size-5" />
          CribAI
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/explore" className="text-sm text-[var(--surface-600)] hover:text-[var(--surface-900)] transition-colors">
            Browse
          </Link>
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: 'default', size: 'sm' }),
              'rounded-full bg-[var(--primary-600)] text-white hover:bg-[var(--primary-700)]'
            )}
          >
            Get Started
          </Link>
        </div>
      </nav>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-20">
      <div className="mx-auto max-w-2xl text-center space-y-8">
        <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-bold text-[var(--surface-900)] leading-tight tracking-tight">
          Summer Subleases
          <br />
          <span className="bg-gradient-to-r from-[var(--primary-700)] to-[var(--primary-400)] bg-clip-text text-transparent">
            at UW-Madison
          </span>
        </h1>

        <p className="text-lg text-[var(--surface-500)] leading-relaxed">
          Post your sublease or find summer housing — with AI-powered search,
          true cost breakdowns, and verified .edu students only.
        </p>

        {/* Stats */}
        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-3xl font-bold text-[var(--primary-600)]">
              {subleaseCount > 0 ? subleaseCount : 'New'}
            </p>
            <p className="text-sm text-[var(--surface-400)]">
              {subleaseCount > 0 ? 'Subleases' : 'Be the first'}
            </p>
          </div>
          <div className="h-10 w-px bg-[var(--surface-200)]" />
          <div className="text-center">
            <p className="text-3xl font-bold text-[var(--primary-600)]">
              {totalCount.toLocaleString()}
            </p>
            <p className="text-sm text-[var(--surface-400)]">Total Listings</p>
          </div>
          <div className="h-10 w-px bg-[var(--surface-200)]" />
          <div className="text-center">
            <p className="text-3xl font-bold text-[var(--primary-600)]">Free</p>
            <p className="text-sm text-[var(--surface-400)]">Always</p>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/explore"
            className={cn(
              buttonVariants({ variant: 'default', size: 'lg' }),
              'h-12 px-8 text-base rounded-full bg-[var(--primary-600)] text-white hover:bg-[var(--primary-700)] shadow-lg shadow-[var(--primary-600)]/20'
            )}
          >
            Find a Sublease
          </Link>
          <Link
            href="/chat"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'h-12 px-8 text-base rounded-full'
            )}
          >
            Post Your Sublease
          </Link>
        </div>

        {/* Trust signals */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-[var(--surface-400)]">
          <span>Verified .edu students</span>
          <span>AI-powered search</span>
          <span>True cost calculator</span>
        </div>
      </div>
      </div>
    </div>
  );
}
