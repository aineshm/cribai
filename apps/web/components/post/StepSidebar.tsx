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
    <aside className="sticky top-0 flex h-screen w-[260px] flex-col border-r border-border bg-card px-6 py-10">
      <h2 className="mb-8 font-[family-name:var(--font-display)] text-lg font-semibold text-foreground">
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
                    'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors',
                    isCompleted &&
                      'border-primary bg-primary text-primary-foreground',
                    isCurrent &&
                      'border-primary bg-primary/10 text-primary',
                    isUpcoming &&
                      'border-muted-foreground/30 text-muted-foreground/50'
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
                        ? 'bg-primary'
                        : 'bg-muted-foreground/20'
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
                  isCurrent && 'text-primary',
                  isCompleted && 'text-foreground',
                  isUpcoming && 'text-muted-foreground/60'
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
