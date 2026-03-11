'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { slideInFromBottom } from '@/lib/animations';

interface MotionSectionProps {
  children: ReactNode;
  className?: string;
  /** Trigger animation when element enters viewport (default: true) */
  once?: boolean;
  /** Viewport margin for triggering animation (default: "-10%") */
  margin?: string;
}

export function MotionSection({
  children,
  className,
  once = true,
  margin = '-10%',
}: MotionSectionProps) {
  return (
    <motion.section
      variants={slideInFromBottom}
      initial="initial"
      whileInView="animate"
      viewport={{ once, margin }}
      className={className}
    >
      {children}
    </motion.section>
  );
}
