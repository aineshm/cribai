import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CampusProvider } from '../../../lib/campus-context';
import { AuthNav } from '../../../components/auth-nav';
import { MobileNav } from '../../../components/mobile-nav';
import { ProfileModal } from '../../../components/profile-modal';
import { NotificationBell } from '../../../components/notification-bell';
import { DevUserSwitcher } from '../../../components/dev-user-switcher';
import { getCurrentUser } from '../../../lib/get-current-user';
import { createSecretClient } from '@campusnest/supabase/server';

export default async function CampusLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ campusSlug: string }>;
}) {
  const { campusSlug } = await params;
  const { user: resolvedUser, supabase, devUser } = await getCurrentUser();

  const { data: campus } = await supabase
    .from('campus_configs')
    .select('*')
    .eq('slug', campusSlug)
    .single();

  if (!campus) {
    notFound();
  }

  // Map snake_case DB fields to camelCase for the CampusConfig type
  const campusConfig = {
    id: campus.id,
    slug: campus.slug,
    name: campus.name,
    universityName: campus.university_name,
    eduDomains: campus.edu_domains,
    latitude: campus.latitude,
    longitude: campus.longitude,
    timezone: campus.timezone,
    scrapeCron: campus.scrape_cron,
    scrapeRadiusKm: campus.scrape_radius_km,
    config: campus.config ?? {},
    isPublic: campus.is_public,
    createdAt: campus.created_at,
  };

  // Determine effective user identity
  const userId = resolvedUser?.id ?? null;
  const userEmail = resolvedUser?.email ?? null;
  const isDevMode = resolvedUser?.isDevMode ?? false;

  let isEduVerified = false;
  let isProfileIncomplete = false;
  let profileData = { displayName: null as string | null, avatarUrl: null as string | null, graduationYear: null as number | null, major: null as string | null };
  let unreadNotificationCount = 0;
  let priceChangedSavesCount = 0;

  if (userId) {
    if (isDevMode && devUser) {
      // In dev mode, derive profile info from the mock user definition
      isEduVerified = devUser.isEduVerified;
      isProfileIncomplete = !devUser.displayName;
      profileData = {
        displayName: devUser.displayName,
        avatarUrl: devUser.avatarUrl,
        graduationYear: devUser.graduationYear,
        major: devUser.major,
      };

      // Still try to fetch notifications/saves from DB (they may exist from seed data)
      // Use the service-role client to bypass RLS for dev users
      try {
        const secretClient = createSecretClient();

        const { count } = await secretClient
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false);
        unreadNotificationCount = count ?? 0;

        const { count: priceChangedCount } = await secretClient
          .from('notifications')
          .select('listing_id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('type', 'price_change')
          .eq('is_read', false);
        priceChangedSavesCount = priceChangedCount ?? 0;
      } catch {
        // If service-role client fails, continue with defaults
      }
    } else {
      // Production path — fetch from DB via authenticated Supabase client
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_edu_verified, display_name, avatar_url, graduation_year, major, profile_completed_at')
        .eq('id', userId)
        .single();
      isEduVerified = profile?.is_edu_verified ?? false;
      isProfileIncomplete = !profile?.display_name && !profile?.profile_completed_at;
      profileData = {
        displayName: profile?.display_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        graduationYear: profile?.graduation_year ?? null,
        major: profile?.major ?? null,
      };

      // Fetch unread notification count
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      unreadNotificationCount = count ?? 0;

      // Fetch count of saved listings with unread price-change notifications
      const { count: priceChangedCount } = await supabase
        .from('notifications')
        .select('listing_id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'price_change')
        .eq('is_read', false);
      priceChangedSavesCount = priceChangedCount ?? 0;
    }
  }

  return (
    <CampusProvider campus={campusConfig}>
      <div className="min-h-[100dvh]">
        <nav className="sticky top-0 z-50 border-b border-[var(--surface-200)] bg-white/80 backdrop-blur-sm px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
                CampusNest
              </Link>
              <span className="hidden sm:inline rounded-full bg-[var(--primary-50)] px-3 py-1 text-xs font-medium text-[var(--primary-700)]">
                {campusConfig.universityName}
              </span>
              {isDevMode && (
                <span className="hidden sm:inline rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 uppercase tracking-wide">
                  Dev
                </span>
              )}
            </div>
            <div className="hidden md:flex items-center gap-6">
              <Link
                href={`/${campusSlug}/listings`}
                className="text-sm font-medium text-[var(--surface-500)] hover:text-[var(--surface-800)] transition-colors"
              >
                Listings
              </Link>
              <Link
                href={`/${campusSlug}/cribai`}
                className="text-sm font-medium text-[var(--surface-500)] hover:text-[var(--surface-800)] transition-colors"
              >
                CribAI
              </Link>
              {userId && (
                <Link
                  href={`/${campusSlug}/submit-listing`}
                  className="text-sm font-medium text-[var(--surface-500)] hover:text-[var(--surface-800)] transition-colors"
                >
                  Submit Listing
                </Link>
              )}
              {userId && (
                <>
                  <Link
                    href={`/${campusSlug}/dashboard`}
                    className="text-sm font-medium text-[var(--surface-500)] hover:text-[var(--surface-800)] transition-colors"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href={`/${campusSlug}/saved`}
                    className="relative text-sm font-medium text-[var(--surface-500)] hover:text-[var(--surface-800)] transition-colors"
                  >
                    Saved
                    {priceChangedSavesCount > 0 && (
                      <span className="absolute -top-2 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                        {priceChangedSavesCount > 9 ? '9+' : priceChangedSavesCount}
                      </span>
                    )}
                  </Link>
                </>
              )}
              {userId && (
                <NotificationBell
                  campusSlug={campusSlug}
                  userId={userId}
                  initialCount={unreadNotificationCount}
                />
              )}
              <AuthNav
                userEmail={userEmail}
                isEduVerified={isEduVerified}
              />
            </div>
            <MobileNav
              campusSlug={campusSlug}
              userId={userId}
              userEmail={userEmail}
              isEduVerified={isEduVerified}
              unreadNotificationCount={unreadNotificationCount}
              priceChangedSavesCount={priceChangedSavesCount}
            />
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-6 py-8 min-h-[calc(100dvh-128px)]">{children}</main>
        <footer className="border-t border-[var(--surface-200)] bg-white px-6 py-6 mt-auto">
          <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--surface-400)]">
            <div className="flex items-center gap-2">
              <span className="font-[family-name:var(--font-display)] text-sm text-[var(--surface-500)]">CampusNest</span>
              <span className="text-[var(--surface-300)]">&middot;</span>
              <span>{campusConfig.universityName}</span>
            </div>
            <div className="flex gap-6">
              <span>About</span>
              <span>Terms</span>
              <span>Privacy</span>
            </div>
          </div>
        </footer>
        {userId && !isDevMode && isProfileIncomplete && (
          <ProfileModal
            initialData={profileData}
            isProfileIncomplete={isProfileIncomplete}
          />
        )}
        {isDevMode && userId && (
          <DevUserSwitcher currentUserId={userId} />
        )}
      </div>
    </CampusProvider>
  );
}
