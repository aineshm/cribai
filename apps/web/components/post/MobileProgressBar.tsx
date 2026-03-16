'use client';

import { motion } from 'framer-motion';
import { springConfig } from '@/lib/animations';

interface MobileProgressBarProps {
  readonly currentStep: number;
  readonly totalSteps: number;
}

export function MobileProgressBar({
  currentStep,
  totalSteps,
}: MobileProgressBarProps) {
  const percentage = Math.round(((currentStep + 1) / totalSteps) * 100);

  return (
    <div className="border-b border-gray-100 bg-white px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold text-gray-900">
          Step {currentStep + 1} of {totalSteps}
        </span>
        <span className="font-medium text-teal-700">{percentage}%</span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <motion.div
          className="h-full rounded-full bg-teal-800"
          initial={false}
          animate={{ width: `${percentage}%` }}
          transition={springConfig.snappy}
        />
      </div>
    </div>
  );
}
