import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSecretClient } from '@campusnest/supabase/server';
import { getCurrentUser } from '../../../../lib/get-current-user';

interface DashboardPageProps {
  params: Promise<{ campusSlug: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { campusSlug } = await params;
  const { user, supabase, devUser } = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  // In dev mode, use service-role client to bypass RLS
  const queryClient = devUser ? createSecretClient() : supabase;

  // Fetch saved listings (most recent 3)
  const { data: savedEntries } = await queryClient
    .from('saved_listings')
    .select(`
      listing_id,
      created_at,
      listings!inner (
        id, address, rent_monthly, bedrooms, source
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(3);

  // Fetch tour requests — sort by earliest preferred date to show upcoming first
  const { data: rawTourRequests } = await queryClient
    .from('tour_requests')
    .select('id, listing_id, preferred_dates, status, listings!inner(address)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Sort by earliest preferred_date ascending, then take top 3
  const tourRequests = (rawTourRequests ?? [])
    .sort((a, b) => {
      const dateA = (a.preferred_dates as string[] | null)?.[0] ?? '';
      const dateB = (b.preferred_dates as string[] | null)?.[0] ?? '';
      return dateA.localeCompare(dateB);
    })
    .slice(0, 3);

  const savedCount = savedEntries?.length ?? 0;
  const tourCount = tourRequests.length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--surface-900)] mb-6">
        Dashboard
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Saved Items */}
        <div className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-50)] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--surface-800)]">
              Saved Items
            </h2>
            {savedCount > 0 && (
              <span className="text-xs font-medium text-[var(--primary-600)] bg-[var(--primary-50)] px-2 py-0.5 rounded-full">
                {savedCount}
              </span>
            )}
          </div>
          {savedCount > 0 ? (
            <div className="space-y-3">
              {savedEntries!.map((entry) => {
                const listing = entry.listings as unknown as {
                  readonly id: string;
                  readonly address: string;
                  readonly rent_monthly: number | null;
                  readonly bedrooms: number | null;
                  readonly source: string | null;
                };
                return (
                  <div key={entry.listing_id} className="flex flex-col gap-0.5">
                    <p className="text-sm text-[var(--surface-600)] truncate">
                      {listing.address}
                    </p>
                    <p className="text-xs text-[var(--surface-400)]">
                      {listing.rent_monthly
                        ? `$${listing.rent_monthly.toLocaleString()}/mo`
                        : 'Price N/A'}
                      {listing.bedrooms != null && ` - ${listing.bedrooms} bed`}
                    </p>
                  </div>
                );
              })}
              <Link
                href={`/${campusSlug}/saved`}
                className="block text-sm font-medium text-[var(--primary-600)] hover:text-[var(--primary-700)] mt-2 transition-colors"
              >
                View all saved
              </Link>
            </div>
          ) : (
            <p className="text-sm text-[var(--surface-400)]">
              No saved items yet
            </p>
          )}
        </div>

        {/* Upcoming Appointments */}
        <div className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-50)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--surface-800)] mb-4">
            Upcoming Appointments
          </h2>
          {tourCount > 0 ? (
            <div className="space-y-3">
              {tourRequests.map((tour) => {
                const listing = tour.listings as unknown as { readonly address: string };
                const firstDate = (tour.preferred_dates as string[])?.[0];
                return (
                <div key={tour.id} className="flex flex-col gap-0.5">
                  <p className="text-sm text-[var(--surface-600)] truncate">
                    {listing.address}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-[var(--surface-400)]">
                      {firstDate
                        ? new Date(firstDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Date TBD'}
                    </p>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        tour.status === 'confirmed'
                          ? 'bg-emerald-50 text-emerald-700'
                          : tour.status === 'cancelled'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      {tour.status}
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--surface-400)]">
              No appointments yet
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
