'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { listingSubmissionSchema } from '@campusnest/types';

type FieldErrors = Partial<Record<string, string[]>>;

const INITIAL_FORM = {
  address: '',
  rent_monthly: '',
  bedrooms: '1',
  bathrooms: '',
  sqft: '',
  amenities: '',
  available_date: '',
  description: '',
  contact_email: '',
  source_url: '',
};

interface SubmitListingFormProps {
  readonly campusSlug?: string;
}

export function SubmitListingForm({ campusSlug }: SubmitListingFormProps) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    // Build payload with correct types
    const payload = {
      address: form.address.trim(),
      rent_monthly: Number(form.rent_monthly),
      bedrooms: Number(form.bedrooms),
      bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
      sqft: form.sqft ? Number(form.sqft) : undefined,
      amenities: form.amenities
        ? form.amenities.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      available_date: form.available_date || undefined,
      description: form.description.trim() || undefined,
      contact_email: form.contact_email.trim(),
      source_url: form.source_url.trim() || undefined,
    };

    // Client-side validation
    const result = listingSubmissionSchema.safeParse(payload);
    if (!result.success) {
      const flat = result.error.flatten();
      setFieldErrors(flat.fieldErrors as FieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/submit-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        toast.error(body.error ?? 'Failed to submit listing');
        return;
      }

      toast.success('Listing submitted successfully!');
      setIsSubmitted(true);
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--surface-200)] bg-white p-10 text-center shadow-sm animate-fade-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-50)]">
          <svg className="h-8 w-8 text-[var(--primary-600)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mt-4 font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
          Listing submitted!
        </h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--surface-500)]">
          Your listing will be reviewed and added to CampusNest. Fellow students will be able to discover it soon.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => { setIsSubmitted(false); setForm(INITIAL_FORM); }}
            className="rounded-lg border border-[var(--surface-200)] px-5 py-2.5 text-sm font-medium text-[var(--surface-700)] hover:bg-[var(--surface-50)] transition-colors"
          >
            Submit another
          </button>
          {campusSlug && (
            <Link
              href={`/${campusSlug}/listings`}
              className="rounded-lg bg-[var(--primary-600)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-700)] transition-colors"
            >
              Browse listings
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section 1: Location & Basics */}
      <div className="rounded-xl border border-[var(--surface-200)] bg-white p-6 shadow-sm space-y-5">
        <h3 className="text-base font-semibold text-[var(--surface-800)] mb-4">Location & Basics</h3>

        {/* Address */}
        <div>
          <label htmlFor="address" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
            Address <span className="text-red-500">*</span>
          </label>
          <input
            id="address"
            name="address"
            type="text"
            value={form.address}
            onChange={handleChange}
            placeholder="123 University Ave, Madison, WI"
            className="w-full rounded-lg border border-[var(--surface-200)] px-3 py-2 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
          />
          {fieldErrors.address && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.address[0]}</p>
          )}
        </div>

        {/* Rent & Bedrooms row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="rent_monthly" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
              Monthly Rent <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[var(--surface-500)]">$</span>
              <input
                id="rent_monthly"
                name="rent_monthly"
                type="number"
                min="1"
                max="10000"
                value={form.rent_monthly}
                onChange={handleChange}
                placeholder="1200"
                className="w-full rounded-lg border border-[var(--surface-200)] pl-7 pr-3 py-2 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
              />
            </div>
            {fieldErrors.rent_monthly && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.rent_monthly[0]}</p>
            )}
          </div>
          <div>
            <label htmlFor="bedrooms" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
              Bedrooms <span className="text-red-500">*</span>
            </label>
            <select
              id="bedrooms"
              name="bedrooms"
              value={form.bedrooms}
              onChange={handleChange}
              className="w-full rounded-lg border border-[var(--surface-200)] px-3 py-2 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
            >
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? 'Studio' : i}
                </option>
              ))}
            </select>
            {fieldErrors.bedrooms && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.bedrooms[0]}</p>
            )}
          </div>
        </div>

        {/* Bathrooms & Sqft row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="bathrooms" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
              Bathrooms
            </label>
            <select
              id="bathrooms"
              name="bathrooms"
              value={form.bathrooms}
              onChange={handleChange}
              className="w-full rounded-lg border border-[var(--surface-200)] px-3 py-2 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
            >
              <option value="">--</option>
              {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sqft" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
              Square Feet
            </label>
            <input
              id="sqft"
              name="sqft"
              type="number"
              min="1"
              value={form.sqft}
              onChange={handleChange}
              placeholder="800"
              className="w-full rounded-lg border border-[var(--surface-200)] px-3 py-2 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
            />
          </div>
        </div>
      </div>

      {/* Section 2: Listing Details */}
      <div className="rounded-xl border border-[var(--surface-200)] bg-white p-6 shadow-sm space-y-5">
        <h3 className="text-base font-semibold text-[var(--surface-800)] mb-4">Listing Details</h3>

        {/* Available Date */}
        <div>
          <label htmlFor="available_date" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
            Available Date
          </label>
          <input
            id="available_date"
            name="available_date"
            type="date"
            value={form.available_date}
            onChange={handleChange}
            className="w-full rounded-lg border border-[var(--surface-200)] px-3 py-2 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
          />
          {fieldErrors.available_date && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.available_date[0]}</p>
          )}
        </div>

        {/* Amenities */}
        <div>
          <label htmlFor="amenities" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
            Amenities
          </label>
          <input
            id="amenities"
            name="amenities"
            type="text"
            value={form.amenities}
            onChange={handleChange}
            placeholder="Parking, Laundry, AC, Pet Friendly"
            className="w-full rounded-lg border border-[var(--surface-200)] px-3 py-2 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
          />
          <p className="mt-1 text-xs text-[var(--surface-400)]">Comma-separated list</p>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            value={form.description}
            onChange={handleChange}
            placeholder="Additional details about the listing..."
            className="w-full rounded-lg border border-[var(--surface-200)] px-3 py-2 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)] resize-y"
          />
          {fieldErrors.description && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.description[0]}</p>
          )}
        </div>
      </div>

      {/* Section 3: Contact Information */}
      <div className="rounded-xl border border-[var(--surface-200)] bg-white p-6 shadow-sm space-y-5">
        <h3 className="text-base font-semibold text-[var(--surface-800)] mb-4">Contact Information</h3>

        {/* Contact Email */}
        <div>
          <label htmlFor="contact_email" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
            Contact Email <span className="text-red-500">*</span>
          </label>
          <input
            id="contact_email"
            name="contact_email"
            type="email"
            value={form.contact_email}
            onChange={handleChange}
            placeholder="landlord@example.com"
            className="w-full rounded-lg border border-[var(--surface-200)] px-3 py-2 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
          />
          {fieldErrors.contact_email && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.contact_email[0]}</p>
          )}
        </div>

        {/* Source URL */}
        <div>
          <label htmlFor="source_url" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
            Listing URL <span className="text-xs font-normal text-[var(--surface-400)]">(optional)</span>
          </label>
          <input
            id="source_url"
            name="source_url"
            type="url"
            value={form.source_url}
            onChange={handleChange}
            placeholder="https://craigslist.org/listing/..."
            className="w-full rounded-lg border border-[var(--surface-200)] px-3 py-2 text-sm focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
          />
          {fieldErrors.source_url && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.source_url[0]}</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-[var(--primary-600)] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Sharing...' : 'Share Listing'}
      </button>
    </form>
  );
}
