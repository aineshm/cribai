'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthNav } from './auth-nav';

interface MobileNavProps {
  readonly campusSlug: string;
  readonly userEmail: string | null;
  readonly isEduVerified: boolean;
  readonly unreadNotificationCount?: number;
}

export function MobileNav({ campusSlug, userEmail, isEduVerified, unreadNotificationCount = 0 }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  function handleLinkClick() {
    setIsOpen(false);
  }

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-8 w-8 flex-col items-center justify-center gap-1.5 rounded-md hover:bg-[var(--surface-100)] transition-colors"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
      >
        <span
          className={`block h-0.5 w-5 bg-[var(--surface-600)] transition-transform duration-200 ${
            isOpen ? 'translate-y-2 rotate-45' : ''
          }`}
        />
        <span
          className={`block h-0.5 w-5 bg-[var(--surface-600)] transition-opacity duration-200 ${
            isOpen ? 'opacity-0' : ''
          }`}
        />
        <span
          className={`block h-0.5 w-5 bg-[var(--surface-600)] transition-transform duration-200 ${
            isOpen ? '-translate-y-2 -rotate-45' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full border-b border-[var(--surface-200)] bg-white/95 backdrop-blur-sm shadow-lg">
          <div className="flex flex-col gap-1 p-4">
            <Link
              href={`/${campusSlug}/listings`}
              onClick={handleLinkClick}
              className={`rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                pathname?.includes('/listings')
                  ? 'bg-[var(--primary-50)] text-[var(--primary-700)]'
                  : 'text-[var(--surface-600)] hover:bg-[var(--surface-50)]'
              }`}
            >
              Listings
            </Link>
            <Link
              href={`/${campusSlug}/cribai`}
              onClick={handleLinkClick}
              className={`rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                pathname?.includes('/cribai')
                  ? 'bg-[var(--primary-50)] text-[var(--primary-700)]'
                  : 'text-[var(--surface-600)] hover:bg-[var(--surface-50)]'
              }`}
            >
              CribAI
            </Link>
            <Link
              href={`/${campusSlug}/dashboard`}
              onClick={handleLinkClick}
              className={`rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                pathname?.includes('/dashboard')
                  ? 'bg-[var(--primary-50)] text-[var(--primary-700)]'
                  : 'text-[var(--surface-600)] hover:bg-[var(--surface-50)]'
              }`}
            >
              Dashboard
            </Link>
            <Link
              href={`/${campusSlug}/saved`}
              onClick={handleLinkClick}
              className={`rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                pathname?.includes('/saved')
                  ? 'bg-[var(--primary-50)] text-[var(--primary-700)]'
                  : 'text-[var(--surface-600)] hover:bg-[var(--surface-50)]'
              }`}
            >
              Saved
            </Link>
            <Link
              href={`/${campusSlug}/notifications`}
              onClick={handleLinkClick}
              className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                pathname?.includes('/notifications')
                  ? 'bg-[var(--primary-50)] text-[var(--primary-700)]'
                  : 'text-[var(--surface-600)] hover:bg-[var(--surface-50)]'
              }`}
            >
              Notifications
              {unreadNotificationCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </span>
              )}
            </Link>
            <div className="mt-2 border-t border-[var(--surface-100)] pt-3 px-4">
              <AuthNav userEmail={userEmail} isEduVerified={isEduVerified} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
