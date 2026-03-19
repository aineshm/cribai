'use client';

import { useCallback, useState } from 'react';
import { Pencil, Save, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PhotoUploader } from './PhotoUploader';
import type { ListingDetail } from '@/lib/listing-types';

interface EditListingFormProps {
  readonly listing: ListingDetail;
  readonly userId: string;
  readonly onListingUpdated: (updated: Partial<ListingDetail>) => void;
}

export function EditListingForm({ listing, userId, onListingUpdated }: EditListingFormProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState({
    address: listing.address,
    rent_monthly: listing.price,
    bedrooms: listing.beds,
    bathrooms: listing.baths,
    sqft: listing.sqft,
    description: listing.description,
    available_date: listing.availableDate ?? '',
    contact_email: listing.contactEmail ?? '',
  });

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {};

      if (fields.address !== listing.address) updateData.address = fields.address;
      if (fields.rent_monthly !== listing.price) updateData.rent_monthly = fields.rent_monthly;
      if (fields.bedrooms !== listing.beds) updateData.bedrooms = fields.bedrooms;
      if (fields.bathrooms !== listing.baths) updateData.bathrooms = fields.bathrooms;
      if (fields.sqft !== listing.sqft) updateData.sqft = fields.sqft;
      if (fields.description !== listing.description) updateData.description = fields.description;
      if (fields.available_date !== (listing.availableDate ?? '')) updateData.available_date = fields.available_date || undefined;
      if (fields.contact_email !== (listing.contactEmail ?? '')) updateData.contact_email = fields.contact_email || undefined;

      if (Object.keys(updateData).length === 0) {
        setEditing(false);
        return;
      }

      const res = await fetch(`/api/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (res.ok) {
        toast.success('Listing updated');
        onListingUpdated({
          address: fields.address,
          price: fields.rent_monthly,
          beds: fields.bedrooms,
          baths: fields.bathrooms,
          sqft: fields.sqft,
          description: fields.description,
          availableDate: fields.available_date || null,
          contactEmail: fields.contact_email || null,
        });
        setEditing(false);
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        toast.error(body.error ?? 'Failed to update');
      }
    } catch {
      toast.error('Failed to update listing');
    } finally {
      setSaving(false);
    }
  }, [fields, listing, onListingUpdated]);

  const INPUT_CLASS = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none w-full';

  if (!editing) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-xl border border-teal-200 transition-colors"
        >
          <Pencil className="size-3.5" />
          Edit Listing
        </button>

        {/* Photo uploader is always visible for creators */}
        <PhotoUploader
          listingId={listing.id}
          userId={userId}
          existingPhotos={listing.photoUrls}
          onPhotosUpdated={(urls) => onListingUpdated({ photoUrls: urls })}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Edit Listing</h3>
        <button
          type="button"
          aria-label="Cancel editing"
          onClick={() => setEditing(false)}
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <X className="size-4 text-gray-500" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 col-span-1 sm:col-span-2">
          <span className="text-xs font-medium text-gray-600">Address</span>
          <input
            type="text"
            value={fields.address}
            onChange={(e) => setFields(prev => ({ ...prev, address: e.target.value }))}
            className={INPUT_CLASS}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">Monthly Rent ($)</span>
          <input
            type="number"
            value={fields.rent_monthly}
            onChange={(e) => setFields(prev => ({ ...prev, rent_monthly: Number(e.target.value) }))}
            className={INPUT_CLASS}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">Bedrooms</span>
          <input
            type="number"
            value={fields.bedrooms ?? ''}
            onChange={(e) => setFields(prev => ({ ...prev, bedrooms: e.target.value ? Number(e.target.value) : null }))}
            min={0}
            className={INPUT_CLASS}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">Bathrooms</span>
          <input
            type="number"
            value={fields.bathrooms ?? ''}
            onChange={(e) => setFields(prev => ({ ...prev, bathrooms: e.target.value ? Number(e.target.value) : null }))}
            min={0}
            className={INPUT_CLASS}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">Sqft</span>
          <input
            type="number"
            value={fields.sqft ?? ''}
            onChange={(e) => setFields(prev => ({ ...prev, sqft: e.target.value ? Number(e.target.value) : null }))}
            className={INPUT_CLASS}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">Available Date</span>
          <input
            type="date"
            value={fields.available_date}
            onChange={(e) => setFields(prev => ({ ...prev, available_date: e.target.value }))}
            className={INPUT_CLASS}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">Contact Email</span>
          <input
            type="email"
            value={fields.contact_email}
            onChange={(e) => setFields(prev => ({ ...prev, contact_email: e.target.value }))}
            className={INPUT_CLASS}
          />
        </label>

        <label className="space-y-1 col-span-1 sm:col-span-2">
          <span className="text-xs font-medium text-gray-600">Description</span>
          <textarea
            value={fields.description}
            onChange={(e) => setFields(prev => ({ ...prev, description: e.target.value }))}
            rows={3}
            className={INPUT_CLASS + ' resize-none'}
          />
        </label>
      </div>

      {/* Photo uploader */}
      <PhotoUploader
        listingId={listing.id}
        userId={userId}
        existingPhotos={listing.photoUrls}
        onPhotosUpdated={(urls) => onListingUpdated({ photoUrls: urls })}
      />

      {/* Save / Cancel */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-teal-800 hover:bg-teal-900 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save Changes
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
