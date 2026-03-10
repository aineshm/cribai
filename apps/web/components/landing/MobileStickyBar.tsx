'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { slideInFromBottom } from '@/lib/animations';

export function MobileStickyBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const heroCta = document.getElementById('hero-cta');
    if (!heroCta) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setVisible(!entry.isIntersecting);
        }
      },
      { threshold: 0 }
    );

    observer.observe(heroCta);
    return () => observer.disconnect();
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          variants={slideInFromBottom}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed bottom-0 inset-x-0 z-50 border-t border-[var(--surface-200)] bg-white/95 backdrop-blur-sm p-4 sm:hidden"
        >
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: 'default', size: 'lg' }),
              'w-full h-12 text-base rounded-full bg-[var(--primary-600)] text-white hover:bg-[var(--primary-700)] shadow-lg shadow-[var(--primary-600)]/20'
            )}
          >
            Get Started Free
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
