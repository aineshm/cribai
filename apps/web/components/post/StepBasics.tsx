'use client';

import { Input } from '@/components/ui/input';
import type { WizardFormData, PropertyType } from './PostWizard';
import { cn } from '@/lib/utils';
import { MapPin, DollarSign, Calendar, Home } from 'lucide-react';

interface StepBasicsProps {
  readonly formData: WizardFormData;
  readonly updateFormData: (updates: Partial<WizardFormData>) => void;
}

const PROPERTY_TYPES: ReadonlyArray<{
  readonly value: PropertyType;
  readonly label: string;
}> = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'room', label: 'Room' },
] as const;

export function StepBasics({ formData, updateFormData }: StepBasicsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-foreground">
          Basic Information
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Start with the essentials about your sublease.
        </p>
      </div>

      {/* Address */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MapPin className="size-4 text-muted-foreground" />
          Address
        </label>
        <Input
          placeholder="123 College Ave, Apt 4B"
          value={formData.address}
          onChange={(e) => updateFormData({ address: e.target.value })}
        />
      </div>

      {/* Monthly Rent */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <DollarSign className="size-4 text-muted-foreground" />
          Monthly Rent
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <Input
            type="number"
            placeholder="1200"
            className="pl-7"
            value={formData.monthlyRent}
            onChange={(e) => updateFormData({ monthlyRent: e.target.value })}
          />
        </div>
      </div>

      {/* Lease Dates */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Calendar className="size-4 text-muted-foreground" />
            Lease Start
          </label>
          <Input
            type="date"
            value={formData.leaseStart}
            onChange={(e) => updateFormData({ leaseStart: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Calendar className="size-4 text-muted-foreground" />
            Lease End
          </label>
          <Input
            type="date"
            value={formData.leaseEnd}
            onChange={(e) => updateFormData({ leaseEnd: e.target.value })}
          />
        </div>
      </div>

      {/* Property Type */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Home className="size-4 text-muted-foreground" />
          Property Type
        </label>
        <div className="flex gap-3">
          {PROPERTY_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => updateFormData({ propertyType: type.value })}
              className={cn(
                'flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors',
                formData.propertyType === type.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/40'
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
