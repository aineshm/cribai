'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Bot, Heart, User, PlusCircle } from 'lucide-react';

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

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/explore', icon: Search, label: 'Search', match: '/explore' },
  { href: '/messages', icon: Bot, label: 'Agent', match: '/messages', showDot: true },
  { href: '/post', icon: PlusCircle, label: 'Post', match: '/post', elevated: true },
  { href: '/profile?tab=saved', icon: Heart, label: 'Saved', match: '/profile' },
  { href: '/profile', icon: User, label: 'Profile', match: '/profile' },
];

export function MobileBottomNav({ isAuthenticated }: MobileBottomNavProps) {
  const pathname = usePathname();

  if (!isAuthenticated) return null;
  // Hide on listing detail (has its own bottom bar) and auth pages
  if (pathname.startsWith('/listing/')) return null;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 pb-safe z-50 flex items-center justify-around h-16 px-2">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.match || pathname.startsWith(`${item.match}/`);
        const Icon = item.icon;

        if (item.elevated) {
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center w-full h-full space-y-1 text-gray-400"
            >
              <div className="bg-teal-800 text-white p-2 rounded-full -mt-6 shadow-lg">
                <Icon size={24} />
              </div>
              <span className="text-[10px] font-medium mt-1">{item.label}</span>
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 relative ${
              isActive ? 'text-teal-800' : 'text-gray-400'
            }`}
          >
            <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            {item.showDot && (
              <span className="absolute top-2 right-4 w-2 h-2 bg-amber-400 rounded-full" />
            )}
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
