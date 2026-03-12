'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@campusnest/supabase/client';
import Link from 'next/link';
import { Bell } from 'lucide-react';

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
      <Bell className="h-5 w-5 text-[var(--surface-500)]" strokeWidth={2} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
