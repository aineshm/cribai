import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../../../lib/get-current-user';
import { createSecretClient } from '@campusnest/supabase/server';

interface NotificationRow {
  readonly id: string;
  readonly type: string;
  readonly listing_id: string | null;
  readonly payload: {
    readonly listing_address?: string;
    readonly campus_slug?: string;
    readonly old_price?: number;
    readonly new_price?: number;
    readonly change_pct?: number;
  };
  readonly is_read: boolean;
  readonly created_at: string;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function groupByDate(
  notifications: readonly NotificationRow[],
): { label: string; items: readonly NotificationRow[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: {
    label: string;
    items: NotificationRow[];
  }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This Week', items: [] },
    { label: 'Earlier', items: [] },
  ];

  for (const n of notifications) {
    const d = new Date(n.created_at);
    if (d >= today) {
      groups[0]!.items.push(n);
    } else if (d >= yesterday) {
      groups[1]!.items.push(n);
    } else if (d >= weekAgo) {
      groups[2]!.items.push(n);
    } else {
      groups[3]!.items.push(n);
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

function formatPrice(cents: number): string {
  return `$${cents.toLocaleString()}`;
}

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ campusSlug: string }>;
}) {
  const { campusSlug } = await params;
  const { user, supabase } = await getCurrentUser();

  if (!user) {
    redirect(`/login?returnTo=/${campusSlug}/notifications`);
  }

  // Use service-role client for dev mode (bypasses RLS), regular client otherwise
  const queryClient = user.isDevMode ? createSecretClient() : supabase;

  // Fetch notifications
  const { data: notifications } = await queryClient
    .from('notifications')
    .select('id, type, listing_id, payload, is_read, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  // Mark all unread as read
  await queryClient
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  const items = (notifications ?? []) as NotificationRow[];
  const groups = groupByDate(items);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <svg
          className="h-16 w-16 text-[var(--surface-300)] mb-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        <h2 className="text-lg font-semibold text-[var(--surface-800)]">
          No notifications yet
        </h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--surface-500)]">
          Save some listings to get price alerts! We will notify you when prices
          change on your saved listings.
        </p>
        <Link
          href={`/${campusSlug}/listings`}
          className="mt-6 rounded-lg bg-[var(--primary-600)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-700)] transition-colors"
        >
          Browse Listings
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-[var(--surface-900)] mb-6">
        Notifications
      </h1>

      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group.label}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--surface-400)] mb-3">
              {group.label}
            </h2>
            <div className="space-y-2">
              {group.items.map((n) => {
                const isPriceChange = n.type === 'price_change';
                const oldPrice = n.payload.old_price;
                const newPrice = n.payload.new_price;
                const isDecrease =
                  oldPrice != null && newPrice != null && newPrice < oldPrice;

                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-4 rounded-xl border p-4 transition-colors ${
                      n.is_read
                        ? 'border-[var(--surface-200)] bg-white'
                        : 'border-[var(--primary-200)] bg-[var(--primary-50)]'
                    }`}
                  >
                    {/* Icon */}
                    <div
                      className={`flex-shrink-0 rounded-full p-2 ${
                        isDecrease
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-red-100 text-red-600'
                      }`}
                    >
                      {isDecrease ? (
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898M18.75 21l3.75-3.75-3.75-3.75"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22M21.75 3l-3.75 3.75L21.75 3z"
                          />
                        </svg>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {!n.is_read && (
                          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[var(--primary-500)]" />
                        )}
                        <p className="text-sm font-medium text-[var(--surface-800)] truncate">
                          {isPriceChange ? 'Price change' : 'Listing update'}
                        </p>
                      </div>

                      {n.payload.listing_address && (
                        <p className="mt-0.5 text-sm text-[var(--surface-600)]">
                          {n.listing_id ? (
                            <Link
                              href={`/${campusSlug}/listings/${n.listing_id}`}
                              className="hover:underline"
                            >
                              {n.payload.listing_address}
                            </Link>
                          ) : (
                            n.payload.listing_address
                          )}
                        </p>
                      )}

                      {isPriceChange &&
                        oldPrice != null &&
                        newPrice != null && (
                          <p className="mt-1 text-sm">
                            <span className="text-[var(--surface-400)] line-through">
                              {formatPrice(oldPrice)}
                            </span>
                            <span className="mx-1.5 text-[var(--surface-400)]">
                              &rarr;
                            </span>
                            <span
                              className={`font-semibold ${
                                isDecrease ? 'text-emerald-600' : 'text-red-600'
                              }`}
                            >
                              {formatPrice(newPrice)}
                            </span>
                            {n.payload.change_pct != null && (
                              <span
                                className={`ml-1.5 text-xs ${
                                  isDecrease
                                    ? 'text-emerald-500'
                                    : 'text-red-500'
                                }`}
                              >
                                ({n.payload.change_pct > 0 ? '+' : ''}
                                {n.payload.change_pct}%)
                              </span>
                            )}
                          </p>
                        )}
                    </div>

                    {/* Timestamp */}
                    <span className="flex-shrink-0 text-xs text-[var(--surface-400)]">
                      {formatRelativeTime(n.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
