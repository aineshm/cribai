'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { fadeIn } from '@/lib/animations';

interface AgentSummaryProps {
  readonly summary: string;
}

export function AgentSummary({ summary }: AgentSummaryProps) {
  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate">
      <Card className="border-none bg-[var(--primary-50)] ring-1 ring-[var(--primary-200)]">
        <CardContent className="flex gap-3">
          <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary-100)]">
            <Sparkles className="size-4 text-[var(--primary-700)]" />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--primary-700)]">
              Agent Summary
            </p>
            <p className="text-sm leading-relaxed text-[var(--primary-900)]">
              {summary}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
