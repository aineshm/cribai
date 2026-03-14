'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { trackEvent } from '@/lib/track-event';

interface HeroProps {
  readonly isAuthenticated?: boolean;
}

export function Hero({ isAuthenticated = false }: HeroProps) {
  const ctaHref = isAuthenticated ? '/explore' : '/login';
  const ctaText = isAuthenticated ? 'Go to Dashboard' : 'Get Started Free';

  return (
    <section className="hero-gradient relative overflow-hidden">
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="mx-auto max-w-4xl px-6 pt-24 pb-20 text-center sm:pt-32 sm:pb-28"
      >
        <motion.h1
          variants={staggerItem}
          className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-[var(--surface-900)] leading-tight tracking-tight"
        >
          Find Your Perfect College Apartment
          <br />
          <span className="bg-gradient-to-r from-[var(--primary-700)] to-[var(--primary-400)] bg-clip-text text-transparent">
            — With AI That Actually Understands Students.
          </span>
        </motion.h1>

        <motion.p
          variants={staggerItem}
          className="mx-auto mt-6 max-w-2xl text-lg sm:text-xl text-[var(--surface-500)] leading-relaxed"
        >
          True Cost Calculator, Price Fairness Scores, and an AI advisor — so
          you never overpay for an apartment again.
        </motion.p>

        <motion.div
          variants={staggerItem}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          id="hero-cta"
        >
          <Link
            href={ctaHref}
            onClick={() => trackEvent('cta_clicked', { cta: 'hero_get_started' })}
            className={cn(
              buttonVariants({ variant: 'default', size: 'lg' }),
              'h-12 px-8 text-base rounded-full bg-[var(--primary-600)] text-white hover:bg-[var(--primary-700)] shadow-lg shadow-[var(--primary-600)]/20'
            )}
          >
            {ctaText}
          </Link>
          <Link
            href="/post"
            onClick={() => trackEvent('cta_clicked', { cta: 'hero_post_sublease' })}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'h-12 px-8 text-base rounded-full'
            )}
          >
            Post Your Sublease
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
