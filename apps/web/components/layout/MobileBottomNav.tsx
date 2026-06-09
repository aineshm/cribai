'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Search, Bot, Heart, User, MessageSquare, Building2 } from 'lucide-react';

interface MobileBottomNavProps {
  readonly isAuthenticated: boolean;
}

interface NavItem {
  readonly href: string;
  readonly icon: typeof Search;
  readonly label: string;
  readonly match: string;
  readonly showDot?: boolean;
  readonly elevated?: boolean;
}

function getNavItems(isAuthenticated: boolean): readonly NavItem[] {
  return [
    { href: '/explore', icon: Search, label: 'Search', match: '/explore' },
    { href: isAuthenticated ? '/messages' : '/login', icon: Bot, label: 'Agent', match: '/messages', showDot: isAuthenticated },
    { href: isAuthenticated ? '/chat' : '/login', icon: MessageSquare, label: 'Chat', match: '/chat', elevated: true },
    { href: '/my-apartments', icon: Building2, label: 'Apartments', match: '/my-apartments' },
    { href: isAuthenticated ? '/profile?tab=saved' : '/login', icon: Heart, label: 'Saved', match: '/profile' },
    { href: isAuthenticated ? '/profile' : '/login', icon: User, label: 'Profile', match: '/profile' },
  ];
}

export function MobileBottomNav({ isAuthenticated }: MobileBottomNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Hide on listing detail (has its own bottom bar), auth pages, and landing page
  if (pathname.startsWith('/listing/')) return null;
  if (pathname === '/login' || pathname === '/verify-edu') return null;
  if (pathname === '/') return null;

  const navItems = getNavItems(isAuthenticated);

  const savedTabActive = pathname === '/profile' && searchParams.get('tab') === 'saved';

  return (
    <nav
      aria-label="Primary"
      className="safe-area-pb md:hidden fixed bottom-0 left-0 right-0 z-50 flex min-h-16 items-center justify-around border-t border-[var(--surface-200)] bg-white px-2"
    >
      {navItems.map((item) => {
        const isSavedLink = item.href.startsWith('/profile?tab=saved');
        const isProfileLink = item.href === '/profile';
        const isActive = isSavedLink
          ? savedTabActive
          : isProfileLink
            ? pathname === '/profile' && !savedTabActive
            : pathname === item.match || pathname.startsWith(`${item.match}/`);
        const Icon = item.icon;

        if (item.elevated) {
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex h-full w-full flex-col items-center justify-center space-y-1 ${
                isActive ? 'text-[var(--primary-700)]' : 'text-[var(--surface-400)]'
              }`}
            >
              <div className="rounded-full bg-[var(--primary-700)] p-2 text-white shadow-lg -mt-6">
                <Icon size={24} />
              </div>
              <span className="text-[10px] font-medium mt-1">{item.label}</span>
            </Link>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex h-full w-full flex-col items-center justify-center space-y-1 ${
              isActive ? 'text-[var(--primary-700)]' : 'text-[var(--surface-400)]'
            }`}
          >
            <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            {item.showDot && (
              <span
                aria-hidden="true"
                className="absolute right-4 top-2 h-2 w-2 rounded-full bg-[var(--secondary-400)]"
              />
            )}
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
