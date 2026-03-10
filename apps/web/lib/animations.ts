import type { Transition, Variants } from 'framer-motion';

/**
 * CampusNest v1.1 Shared Framer Motion Variants & Spring Configs
 *
 * Usage:
 *   import { pageTransition, springConfig } from '@/lib/animations';
 *   <motion.div variants={pageTransition} initial="initial" animate="animate" exit="exit" />
 */

// ─── Spring Presets ───

export const springConfig = {
  /** Quick, responsive interactions (buttons, toggles) */
  snappy: {
    type: 'spring',
    stiffness: 300,
    damping: 30,
  } satisfies Transition,

  /** Smooth, natural movements (panels, page transitions) */
  gentle: {
    type: 'spring',
    stiffness: 200,
    damping: 25,
  } satisfies Transition,

  /** Bouncy, playful feel (cards entering, notifications) */
  bouncy: {
    type: 'spring',
    stiffness: 400,
    damping: 20,
  } satisfies Transition,
} as const;

// ─── Page Transition ───

export const pageTransition: Variants = {
  initial: {
    opacity: 0,
    y: 12,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: springConfig.gentle,
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

// ─── Stagger Container / Item ───

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  initial: {
    opacity: 0,
    y: 16,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: springConfig.gentle,
  },
};

// ─── Directional Slides ───

export const slideInFromRight: Variants = {
  initial: {
    opacity: 0,
    x: 24,
  },
  animate: {
    opacity: 1,
    x: 0,
    transition: springConfig.gentle,
  },
  exit: {
    opacity: 0,
    x: 24,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

export const slideInFromBottom: Variants = {
  initial: {
    opacity: 0,
    y: 24,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: springConfig.gentle,
  },
  exit: {
    opacity: 0,
    y: 24,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

// ─── Interactive Feedback ───

export const scaleOnHover = {
  whileHover: { scale: 1.03, transition: springConfig.snappy },
  whileTap: { scale: 0.98, transition: springConfig.snappy },
} as const;

export const tapShrink = {
  whileTap: { scale: 0.95, transition: springConfig.snappy },
} as const;

// ─── Fade In ───

export const fadeIn: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};

// ─── Scale In (modals, dialogs) ───

export const scaleIn: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: springConfig.snappy,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};
