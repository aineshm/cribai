'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthNav } from './auth-nav';

interface MobileNavProps {
  readonly campusSlug: string;
  readonly userId: string | null;
  readonly userEmail: string | null;
  readonly isEduVerified: boolean;
  readonly unreadNotificationCount?: number;
  readonly priceChangedSavesCount?: number;
}

export function MobileNav({ campusSlug, userId, userEmail, isEduVerified, unreadNotificationCount = 0, priceChangedSavesCount = 0 }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  function handleLinkClick() {
    setIsOpen(false);
  }

  // Escape key to close + focus trap
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        return;
      }

      // Focus trap: cycle through focusable elements within the menu
      if (e.key === 'Tab' && menuRef.current) {
        const focusable = menuRef.current.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Helper for precise active state matching
  const isActive = useCallback(
    (path: string) => pathname?.startsWith(`/${campusSlug}/${path}`) ?? false,
    [pathname, campusSlug]
  );

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
        <div
          ref={menuRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="absolute left-0 right-0 top-full border-b border-[var(--surface-200)] bg-white/95 backdrop-blur-sm shadow-lg"
        >
          <div className="flex flex-col gap-1 p-4">
            <Link
              href={`/${campusSlug}/listings`}
              onClick={handleLinkClick}
              className={`rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                isActive('listings')
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
                isActive('cribai')
                  ? 'bg-[var(--primary-50)] text-[var(--primary-700)]'
                  : 'text-[var(--surface-600)] hover:bg-[var(--surface-50)]'
              }`}
            >
              CribAI
            </Link>
            {userEmail && (
              <Link
                href={`/${campusSlug}/submit-listing`}
                onClick={handleLinkClick}
                className={`rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                  isActive('submit-listing')
                    ? 'bg-[var(--primary-50)] text-[var(--primary-700)]'
                    : 'text-[var(--surface-600)] hover:bg-[var(--surface-50)]'
                }`}
              >
                Share a Listing
              </Link>
            )}
            {userId && (
              <>
                <Link
                  href={`/${campusSlug}/dashboard`}
                  onClick={handleLinkClick}
                  className={`rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                    isActive('dashboard')
                      ? 'bg-[var(--primary-50)] text-[var(--primary-700)]'
                      : 'text-[var(--surface-600)] hover:bg-[var(--surface-50)]'
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  href={`/${campusSlug}/saved`}
                  onClick={handleLinkClick}
                  className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                    isActive('saved')
                      ? 'bg-[var(--primary-50)] text-[var(--primary-700)]'
                      : 'text-[var(--surface-600)] hover:bg-[var(--surface-50)]'
                  }`}
                >
                  Saved
                  {priceChangedSavesCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                      {priceChangedSavesCount > 9 ? '9+' : priceChangedSavesCount}
                    </span>
                  )}
                </Link>
                <Link
                  href={`/${campusSlug}/notifications`}
                  onClick={handleLinkClick}
                  className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                    isActive('notifications')
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
              </>
            )}
            <div className="mt-2 border-t border-[var(--surface-100)] pt-3 px-4">
              <AuthNav userEmail={userEmail} isEduVerified={isEduVerified} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
