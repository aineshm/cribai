'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  MapPin,
  DollarSign,
  Calendar,
  Home,
  BedDouble,
  Bath,
  Ruler,
  Layers,
  Sofa,
  Car,
  ImageIcon,
  Send,
  Loader2,
} from 'lucide-react';
import type { WizardFormData } from './PostWizard';

interface StepReviewProps {
  readonly formData: WizardFormData;
  readonly userEmail?: string;
}

function ReviewRow({
  icon: Icon,
  label,
  value,
}: {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="ml-auto text-sm font-medium text-foreground">
        {value || '—'}
      </span>
    </div>
  );
}

export function StepReview({ formData, userEmail }: StepReviewProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handlePublish = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      // Note: propertyType, furnished, parking, floorLevel, and photos
      // are not yet in the listingSubmissionSchema or DB columns.
      // Photos will need a separate upload flow (Supabase Storage).
      const body = {
        address: formData.address,
        rent_monthly: Number(formData.monthlyRent),
        bedrooms: formData.bedrooms,
        bathrooms: formData.bathrooms,
        sqft: formData.sqft ? Number(formData.sqft) : undefined,
        amenities: [...formData.amenities],
        available_date: formData.leaseStart || undefined,
        description: formData.description || undefined,
        contact_email: userEmail ?? '',
      };

      const res = await fetch('/api/submit-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Submission failed' }));
        throw new Error(data.error ?? 'Failed to submit listing');
      }

      const { listing } = await res.json() as { listing: { id: string } };
      toast.success('Sublease published!', {
        description: 'Your listing is now live and visible to students.',
      });
      router.push(`/listing/${listing.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-foreground">
          Review Your Listing
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Make sure everything looks good before publishing.
        </p>
      </div>

      {/* Basics */}
      <div className="rounded-xl border border-border p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Basics
        </h3>
        <div className="divide-y divide-border">
          <ReviewRow icon={MapPin} label="Address" value={formData.address} />
          <ReviewRow
            icon={DollarSign}
            label="Monthly Rent"
            value={formData.monthlyRent ? `$${formData.monthlyRent}` : ''}
          />
          <ReviewRow
            icon={Calendar}
            label="Lease Period"
            value={
              formData.leaseStart && formData.leaseEnd
                ? `${formData.leaseStart} to ${formData.leaseEnd}`
                : ''
            }
          />
          <ReviewRow
            icon={Home}
            label="Property Type"
            value={
              formData.propertyType.charAt(0).toUpperCase() +
              formData.propertyType.slice(1)
            }
          />
        </div>
      </div>

      {/* Details */}
      <div className="rounded-xl border border-border p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Details
        </h3>
        <div className="divide-y divide-border">
          <ReviewRow
            icon={BedDouble}
            label="Bedrooms"
            value={String(formData.bedrooms)}
          />
          <ReviewRow
            icon={Bath}
            label="Bathrooms"
            value={String(formData.bathrooms)}
          />
          <ReviewRow
            icon={Ruler}
            label="Sq Ft"
            value={formData.sqft ? `${formData.sqft} sqft` : ''}
          />
          <ReviewRow
            icon={Layers}
            label="Floor Level"
            value={formData.floorLevel}
          />
          <ReviewRow
            icon={Sofa}
            label="Furnished"
            value={formData.furnished ? 'Yes' : 'No'}
          />
          <ReviewRow
            icon={Car}
            label="Parking"
            value={formData.parking ? 'Yes' : 'No'}
          />
        </div>
      </div>

      {/* Amenities */}
      {formData.amenities.length > 0 && (
        <div className="rounded-xl border border-border p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Amenities
          </h3>
          <div className="flex flex-wrap gap-2">
            {formData.amenities.map((amenity) => (
              <Badge key={amenity} variant="secondary">
                {amenity
                  .split('-')
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ')}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Photos */}
      <div className="rounded-xl border border-border p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Photos
        </h3>
        <div className="flex items-center gap-2">
          <ImageIcon className="size-4 text-muted-foreground" />
          <span className="text-sm text-foreground">
            {formData.photos.length} photo
            {formData.photos.length !== 1 ? 's' : ''} uploaded
          </span>
        </div>
      </div>

      {/* Description */}
      {formData.description && (
        <div className="rounded-xl border border-border p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Description
          </h3>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {formData.description}
          </p>
        </div>
      )}

      {/* Publish button */}
      <Button
        size="lg"
        className="w-full gap-2"
        onClick={handlePublish}
        disabled={submitting}
      >
        {submitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        {submitting ? 'Publishing…' : 'Publish Sublease'}
      </Button>
    </div>
  );
}
