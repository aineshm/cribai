'use client';

import { useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { WizardFormData } from './PostWizard';

interface StepDescriptionProps {
  readonly formData: WizardFormData;
  readonly updateFormData: (updates: Partial<WizardFormData>) => void;
}

const MAX_CHARS = 1000;

const SAMPLE_DESCRIPTION = `Bright and spacious sublease available in a modern student-friendly complex, just steps from campus. This well-maintained unit features large windows with natural light, updated fixtures, and a functional layout perfect for studying and relaxing. The building offers great amenities and the location can't be beat — walking distance to libraries, dining, and public transit. Utilities are included in rent. Available for immediate move-in. Don't miss this opportunity!`;

export function StepDescription({
  formData,
  updateFormData,
}: StepDescriptionProps) {
  const charCount = formData.description.length;

  const handleAiAssist = useCallback(() => {
    updateFormData({ description: SAMPLE_DESCRIPTION });
    toast.success('AI-generated description added!', {
      description: 'Feel free to edit it to match your listing.',
    });
  }, [updateFormData]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-foreground">
            Description
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Write a compelling description for your sublease.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAiAssist}
          className="gap-1.5 shrink-0"
        >
          <Sparkles className="size-3.5" />
          AI Assist
        </Button>
      </div>

      <div className="space-y-2">
        <textarea
          placeholder="Describe your space, neighborhood, and what makes it a great sublease..."
          value={formData.description}
          onChange={(e) => {
            const value = e.target.value.slice(0, MAX_CHARS);
            updateFormData({ description: value });
          }}
          rows={8}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="flex justify-end">
          <span
            className={`text-xs ${
              charCount > MAX_CHARS * 0.9
                ? 'text-slate-600'
                : 'text-muted-foreground'
            }`}
          >
            {charCount}/{MAX_CHARS}
          </span>
        </div>
      </div>
    </div>
  );
}
