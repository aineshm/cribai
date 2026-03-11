'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { springConfig } from '@/lib/animations';

interface AIChatButtonProps {
  readonly onClick: () => void;
}

export function AIChatButton({ onClick }: AIChatButtonProps) {
  return (
    <motion.div
      className="fixed bottom-6 right-6 z-40"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ ...springConfig.bouncy, delay: 0.5 }}
    >
      <Button
        size="icon-lg"
        aria-label="Open CribAI chat"
        className="size-14 rounded-full bg-[var(--primary-700)] hover:bg-[var(--primary-800)] text-white shadow-lg hover:shadow-xl transition-shadow"
        onClick={onClick}
        aria-label="Open CribAI chat"
      >
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            repeatDelay: 3,
            ease: 'easeInOut',
          }}
        >
          <Sparkles className="size-6" />
        </motion.div>
      </Button>
    </motion.div>
  );
}
