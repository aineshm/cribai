'use client';

import { type ReactNode } from 'react';
import { motion, type Variants } from 'framer-motion';
import { springConfig } from '@/lib/animations';
import { cn } from '@/lib/utils';

const sectionVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 24,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: springConfig.gentle,
  },
};

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
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin }}
      className={cn(className)}
    >
      {children}
    </motion.section>
  );
}
