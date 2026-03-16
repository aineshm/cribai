'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepSidebarProps {
  readonly steps: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly currentStep: number;
  readonly completedSteps: ReadonlyArray<number>;
  readonly onStepClick: (step: number) => void;
}

export function StepSidebar({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
}: StepSidebarProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-[260px] flex-col border-r border-gray-100 bg-white px-6 py-10">
      <h2 className="mb-8 font-[family-name:var(--font-display)] text-lg font-bold text-gray-900">
        Post Sublease
      </h2>

      <nav className="flex flex-1 flex-col gap-0">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(index);
          const isCurrent = index === currentStep;
          const isUpcoming = !isCompleted && !isCurrent;

          return (
            <div key={step.id} className="flex items-start gap-3">
              {/* Connector + Circle column */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => onStepClick(index)}
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all',
                    isCompleted &&
                      'bg-teal-800 text-white shadow-sm',
                    isCurrent &&
                      'border-2 border-amber-400 bg-white text-teal-800 ring-4 ring-amber-400/20',
                    isUpcoming &&
                      'border-2 border-gray-200 text-gray-400'
                  )}
                >
                  {isCompleted ? (
                    <Check className="size-4" />
                  ) : (
                    index + 1
                  )}
                </button>

                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'h-8 w-0.5 transition-colors',
                      isCompleted
                        ? 'bg-teal-800'
                        : 'bg-gray-200'
                    )}
                  />
                )}
              </div>

              {/* Label */}
              <button
                type="button"
                onClick={() => onStepClick(index)}
                className={cn(
                  'mt-1 text-sm font-medium transition-colors',
                  isCurrent && 'text-teal-800 font-bold',
                  isCompleted && 'text-gray-900',
                  isUpcoming && 'text-gray-400'
                )}
              >
                {step.label}
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
