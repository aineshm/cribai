'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fadeIn } from '@/lib/animations';

interface FooterCTAProps {
  readonly isAuthenticated?: boolean;
}

export function FooterCTA({ isAuthenticated = false }: FooterCTAProps) {
  const ctaHref = isAuthenticated ? '/explore' : '/login';
  const ctaText = isAuthenticated ? 'Go to Dashboard' : 'Get Started Free';

  return (
    <motion.section
      variants={fadeIn}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, margin: '-50px' }}
      className="bg-[var(--primary-700)] py-16 sm:py-20"
    >
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl text-white tracking-tight">
          Ready to find your nest?
        </h2>
        <p className="mt-4 text-[var(--primary-200)] text-lg">
          Join thousands of students already using CribAI to find fair,
          transparent housing.
        </p>
        <Link
          href={ctaHref}
          className={cn(
            buttonVariants({ variant: 'default', size: 'lg' }),
            'mt-8 h-12 px-10 text-base rounded-full bg-white text-[var(--primary-700)] hover:bg-[var(--surface-100)] shadow-lg'
          )}
        >
          {ctaText}
        </Link>
      </div>
    </motion.section>
  );
}
