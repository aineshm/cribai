'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { slideInFromBottom } from '@/lib/animations';

interface MobileStickyBarProps {
  readonly isAuthenticated?: boolean;
  /** Override internal IntersectionObserver visibility — used in tests */
  readonly visible?: boolean;
}

export function MobileStickyBar({ isAuthenticated = false, visible: visibleProp }: MobileStickyBarProps) {
  const [observedVisible, setObservedVisible] = useState(false);

  useEffect(() => {
    // If visibility is externally controlled (e.g. tests), skip observer setup
    if (visibleProp !== undefined) return;

    const heroCta = document.getElementById('hero-cta');
    if (!heroCta) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setObservedVisible(!entry.isIntersecting);
        }
      },
      { threshold: 0 }
    );

    observer.observe(heroCta);
    return () => observer.disconnect();
  }, [visibleProp]);

  const isVisible = visibleProp !== undefined ? visibleProp : observedVisible;
  const ctaHref = isAuthenticated ? '/explore' : '/login';
  const ctaText = isAuthenticated ? 'Go to Dashboard' : 'Get Started Free';

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          variants={slideInFromBottom}
          initial="initial"
          animate="animate"
          exit="exit"
          data-testid="mobile-sticky-bar"
          className="fixed bottom-0 inset-x-0 z-50 border-t border-[var(--surface-200)] bg-white/95 backdrop-blur-sm p-4 sm:hidden"
        >
          <Link
            href={ctaHref}
            className={cn(
              buttonVariants({ variant: 'default', size: 'lg' }),
              'w-full h-12 text-base rounded-full bg-[var(--primary-600)] text-white hover:bg-[var(--primary-700)] shadow-lg shadow-[var(--primary-600)]/20'
            )}
          >
            {ctaText}
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
