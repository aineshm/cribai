'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@campusnest/supabase/client';
import Link from 'next/link';

interface NotificationBellProps {
  readonly campusSlug: string;
  readonly userId: string;
  readonly initialCount: number;
}

export function NotificationBell({
  campusSlug,
  userId,
  initialCount,
}: NotificationBellProps) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          setCount((prev) => prev + 1);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newRow = payload.new as { is_read: boolean };
          const oldRow = payload.old as { is_read?: boolean };
          if (newRow.is_read && !oldRow.is_read) {
            setCount((prev) => Math.max(0, prev - 1));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <Link
      href={`/${campusSlug}/notifications`}
      className="relative p-1.5 rounded-md hover:bg-[var(--surface-100)] transition-colors"
      aria-label={
        count > 0 ? `${count} unread notifications` : 'Notifications'
      }
    >
      <svg
        className="h-5 w-5 text-[var(--surface-500)]"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
        />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
