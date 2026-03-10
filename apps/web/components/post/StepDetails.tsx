'use client';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Ruler, Layers, Sofa, Car } from 'lucide-react';
import type { WizardFormData } from './PostWizard';

interface StepDetailsProps {
  readonly formData: WizardFormData;
  readonly updateFormData: (updates: Partial<WizardFormData>) => void;
}

function Counter({
  label,
  value,
  onIncrement,
  onDecrement,
  min = 0,
}: {
  readonly label: string;
  readonly value: number;
  readonly onIncrement: () => void;
  readonly onDecrement: () => void;
  readonly min?: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onDecrement}
          disabled={value <= min}
        >
          <Minus className="size-3" />
        </Button>
        <span className="w-6 text-center text-sm font-semibold text-foreground">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onIncrement}
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}

export function StepDetails({ formData, updateFormData }: StepDetailsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-foreground">
          Property Details
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us more about the space.
        </p>
      </div>

      {/* Bedrooms & Bathrooms */}
      <div className="space-y-3">
        <Counter
          label="Bedrooms"
          value={formData.bedrooms}
          onIncrement={() =>
            updateFormData({ bedrooms: formData.bedrooms + 1 })
          }
          onDecrement={() =>
            updateFormData({ bedrooms: formData.bedrooms - 1 })
          }
          min={1}
        />
        <Counter
          label="Bathrooms"
          value={formData.bathrooms}
          onIncrement={() =>
            updateFormData({ bathrooms: formData.bathrooms + 1 })
          }
          onDecrement={() =>
            updateFormData({ bathrooms: formData.bathrooms - 1 })
          }
          min={1}
        />
      </div>

      {/* Sqft & Floor Level */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Ruler className="size-4 text-muted-foreground" />
            Square Footage
          </label>
          <Input
            type="number"
            placeholder="750"
            value={formData.sqft}
            onChange={(e) => updateFormData({ sqft: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Layers className="size-4 text-muted-foreground" />
            Floor Level
          </label>
          <Input
            placeholder="3rd"
            value={formData.floorLevel}
            onChange={(e) => updateFormData({ floorLevel: e.target.value })}
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Sofa className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Furnished
            </span>
          </div>
          <Switch
            checked={formData.furnished}
            onCheckedChange={(checked: boolean) =>
              updateFormData({ furnished: checked })
            }
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Car className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Parking Included
            </span>
          </div>
          <Switch
            checked={formData.parking}
            onCheckedChange={(checked: boolean) =>
              updateFormData({ parking: checked })
            }
          />
        </div>
      </div>
    </div>
  );
}
