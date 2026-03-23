'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

interface LandingMobileMenuProps {
  readonly primaryHref: string;
  readonly primaryText: string;
  readonly agentHref: string;
}

export function LandingMobileMenu({ primaryHref, primaryText, agentHref }: LandingMobileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--surface-600)] hover:bg-gray-100 transition-colors"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 border-b border-gray-200 bg-white/95 backdrop-blur-md px-4 py-4 shadow-lg">
          <div className="flex flex-col gap-3">
            <Link
              href="/explore"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--surface-700)] hover:bg-gray-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              Browse Listings
            </Link>
            <Link
              href={agentHref}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--surface-700)] hover:bg-gray-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              Agent
            </Link>
            <Link
              href={primaryHref}
              className="rounded-xl bg-teal-800 px-5 py-2.5 text-center text-sm font-medium text-white shadow-sm transition-colors hover:bg-teal-900"
              onClick={() => setOpen(false)}
            >
              {primaryText}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
