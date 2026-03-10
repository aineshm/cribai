'use client';

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Hero } from '@/components/landing/Hero';
import { SocialProof } from '@/components/landing/SocialProof';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { FooterCTA } from '@/components/landing/FooterCTA';
import { Footer } from '@/components/landing/Footer';
import { MobileStickyBar } from '@/components/landing/MobileStickyBar';

export default function HomePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-50 glass border-b border-white/20 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
            CampusNest
          </span>
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: 'default', size: 'sm' }),
              'rounded-full bg-[var(--primary-600)] text-white hover:bg-[var(--primary-700)]'
            )}
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1">
        <Hero />
        <SocialProof />
        <Features />
        <HowItWorks />
        <FooterCTA />
      </main>

      <Footer />
      <MobileStickyBar />
    </div>
  );
}
