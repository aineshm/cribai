'use client';

import { cn } from '@/lib/utils';
import type { WizardFormData } from './PostWizard';
import {
  WashingMachine,
  UtensilsCrossed,
  Snowflake,
  Fence,
  Dumbbell,
  Waves,
  PawPrint,
  Zap,
  BookOpen,
  Archive,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface StepAmenitiesProps {
  readonly formData: WizardFormData;
  readonly updateFormData: (updates: Partial<WizardFormData>) => void;
}

const AMENITIES: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
}> = [
  { id: 'laundry', label: 'In-unit Laundry', icon: WashingMachine },
  { id: 'dishwasher', label: 'Dishwasher', icon: UtensilsCrossed },
  { id: 'ac', label: 'AC', icon: Snowflake },
  { id: 'balcony', label: 'Balcony', icon: Fence },
  { id: 'gym', label: 'Gym', icon: Dumbbell },
  { id: 'pool', label: 'Pool', icon: Waves },
  { id: 'pet-friendly', label: 'Pet-friendly', icon: PawPrint },
  { id: 'ev-charging', label: 'EV Charging', icon: Zap },
  { id: 'study-room', label: 'Study Room', icon: BookOpen },
  { id: 'storage', label: 'Storage', icon: Archive },
] as const;

export function StepAmenities({
  formData,
  updateFormData,
}: StepAmenitiesProps) {
  const toggleAmenity = (amenityId: string) => {
    const current = formData.amenities;
    const updated = current.includes(amenityId)
      ? current.filter((a) => a !== amenityId)
      : [...current, amenityId];
    updateFormData({ amenities: updated });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-foreground">
          Amenities
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select all amenities that apply to your listing.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {AMENITIES.map((amenity) => {
          const isSelected = formData.amenities.includes(amenity.id);
          const Icon = amenity.icon;

          return (
            <button
              key={amenity.id}
              type="button"
              onClick={() => toggleAmenity(amenity.id)}
              className={cn(
                'flex items-center gap-3 rounded-lg border-2 px-3 py-3 text-left text-sm font-medium transition-colors',
                isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/40'
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span>{amenity.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
