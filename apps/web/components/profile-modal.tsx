'use client';

import { useEffect, useState } from 'react';
import { ProfileForm } from './profile-form';

interface ProfileModalProps {
  readonly initialData: {
    readonly displayName: string | null;
    readonly graduationYear: number | null;
    readonly major: string | null;
    readonly avatarUrl: string | null;
  };
  readonly isProfileIncomplete: boolean;
}

const DISMISSED_KEY = 'profile_modal_dismissed';

export function ProfileModal({ initialData, isProfileIncomplete }: ProfileModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isProfileIncomplete) return;

    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed !== 'true') {
      setIsOpen(true);
    }
  }, [isProfileIncomplete]);

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setIsOpen(false);
  }

  function handleSuccess() {
    setIsOpen(false);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={handleDismiss}
        onKeyDown={(e) => {
          if (e.key === 'Escape') handleDismiss();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close modal"
      />

      {/* Modal content */}
      <div className="relative z-10 mx-4 w-full max-w-md animate-slide-up rounded-2xl bg-white p-6 shadow-xl">
        <h2
          id="profile-modal-title"
          className="mb-1 text-xl font-semibold text-[var(--surface-900)]"
        >
          Complete your profile
        </h2>
        <p className="mb-6 text-sm text-[var(--surface-500)]">
          Tell us a bit about yourself to personalize your experience.
        </p>

        <ProfileForm
          initialData={initialData}
          onSuccess={handleSuccess}
          submitLabel="Save profile"
        />

        <button
          type="button"
          onClick={handleDismiss}
          className="mt-4 w-full rounded-lg border border-[var(--surface-200)] px-4 py-2.5 text-sm font-medium text-[var(--surface-600)] transition-colors hover:bg-[var(--surface-50)]"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
