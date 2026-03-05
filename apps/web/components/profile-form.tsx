'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@campusnest/supabase/client';
import { profileFormSchema } from '@campusnest/types';

interface ProfileFormProps {
  readonly initialData: {
    readonly displayName: string | null;
    readonly graduationYear: number | null;
    readonly major: string | null;
    readonly avatarUrl: string | null;
  };
  readonly onSuccess?: () => void;
  readonly submitLabel?: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

const GRADUATION_YEARS = Array.from({ length: 12 }, (_, i) => 2024 + i);

export function ProfileForm({
  initialData,
  onSuccess,
  submitLabel = 'Save',
}: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(initialData.displayName ?? '');
  const [graduationYear, setGraduationYear] = useState<number | undefined>(
    initialData.graduationYear ?? undefined
  );
  const [major, setMajor] = useState(initialData.major ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const initials = displayName.trim() ? getInitials(displayName.trim()) : '?';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const formData = {
      displayName: displayName.trim(),
      graduationYear: graduationYear || undefined,
      major: major.trim() || undefined,
    };

    const result = profileFormSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error('You must be logged in to update your profile');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: result.data.displayName,
          graduation_year: result.data.graduationYear ?? null,
          major: result.data.major ?? null,
          profile_completed_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        toast.error('Failed to save profile. Please try again.');
        return;
      }

      toast.success('Profile saved successfully');
      onSuccess?.();
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Avatar initials preview */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-100)] text-xl font-semibold text-[var(--primary-700)]">
          {initials}
        </div>
        <p className="text-sm text-[var(--surface-500)]">
          Your avatar is generated from your display name
        </p>
      </div>

      {/* Display name */}
      <div>
        <label
          htmlFor="displayName"
          className="mb-1 block text-sm font-medium text-[var(--surface-700)]"
        >
          Display name <span className="text-red-500">*</span>
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your display name"
          className="w-full rounded-lg border border-[var(--surface-200)] bg-white px-3 py-2 text-sm text-[var(--surface-900)] placeholder:text-[var(--surface-400)] focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
          required
        />
        {errors.displayName && (
          <p className="mt-1 text-sm text-red-600">{errors.displayName}</p>
        )}
      </div>

      {/* University (read-only) */}
      <div>
        <label
          htmlFor="university"
          className="mb-1 block text-sm font-medium text-[var(--surface-700)]"
        >
          University
        </label>
        <input
          id="university"
          type="text"
          value="University of Wisconsin-Madison"
          disabled
          className="w-full rounded-lg border border-[var(--surface-200)] bg-[var(--surface-50)] px-3 py-2 text-sm text-[var(--surface-500)]"
        />
      </div>

      {/* Graduation year */}
      <div>
        <label
          htmlFor="graduationYear"
          className="mb-1 block text-sm font-medium text-[var(--surface-700)]"
        >
          Graduation year
        </label>
        <select
          id="graduationYear"
          value={graduationYear ?? ''}
          onChange={(e) =>
            setGraduationYear(e.target.value ? Number(e.target.value) : undefined)
          }
          className="w-full rounded-lg border border-[var(--surface-200)] bg-white px-3 py-2 text-sm text-[var(--surface-900)] focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
        >
          <option value="">Select year</option>
          {GRADUATION_YEARS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        {errors.graduationYear && (
          <p className="mt-1 text-sm text-red-600">{errors.graduationYear}</p>
        )}
      </div>

      {/* Major */}
      <div>
        <label
          htmlFor="major"
          className="mb-1 block text-sm font-medium text-[var(--surface-700)]"
        >
          Major
        </label>
        <input
          id="major"
          type="text"
          value={major}
          onChange={(e) => setMajor(e.target.value)}
          placeholder="e.g. Computer Science"
          className="w-full rounded-lg border border-[var(--surface-200)] bg-white px-3 py-2 text-sm text-[var(--surface-900)] placeholder:text-[var(--surface-400)] focus:border-[var(--primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
        />
        {errors.major && (
          <p className="mt-1 text-sm text-red-600">{errors.major}</p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSaving}
        className="w-full rounded-lg bg-[var(--primary-600)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-700)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
