import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { Building2, Home, MessageSquare, Search, Sparkles } from 'lucide-react';
import { ConciergeShell } from '@/components/concierge/ConciergeShell';
import { MainLayoutClient } from '@/components/layout/MainLayoutClient';
import { isCrmEnabled } from '@/lib/crm/feature-flag';

async function getDefaultCampusSlug(
  supabase: ReturnType<typeof createServerComponentClient>
): Promise<string> {
  const { data } = await supabase
    .from('campus_configs')
    .select('slug')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  return data?.slug ?? 'uw-madison';
}

export default async function MainLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  let resolvedUser = user;
  if (!resolvedUser) {
    const headersList = await headers();
    const devJson = headersList.get('x-dev-user-json');
    resolvedUser = devJson ? (JSON.parse(devJson) as typeof user) : null;
  }

  const isAuthenticated = !!resolvedUser;

  const campusSlugFromMeta = resolvedUser?.user_metadata?.campus_slug as string | undefined;
  const campusSlug = campusSlugFromMeta ?? await getDefaultCampusSlug(supabase);

  // Resolve campusId for ChatProvider → AIChatPanel → CribAIChat
  let campusId: string | undefined;
  if (isAuthenticated && resolvedUser) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('campus_id')
      .eq('id', resolvedUser.id)
      .single();
    campusId = (profile?.campus_id as string) ?? undefined;
  }
  if (!campusId) {
    const { data: campus } = await supabase
      .from('campus_configs')
      .select('id')
      .eq('slug', campusSlug)
      .single();
    campusId = campus?.id ?? undefined;
  }

  return (
    // ConciergeShell provides ConciergeContext — must be the outer wrapper so
      // MainLayoutClient (inside) can call useConcierge() to get openToMission.
    <ConciergeShell>
      <MainLayoutClient campusSlug={campusSlug} campusId={campusId} isAuthenticated={isAuthenticated}>
        <div className="min-h-[100dvh] pb-[calc(var(--mobile-nav-height)+var(--safe-area-bottom))] md:pb-0">
          <nav className="sticky top-0 z-50 border-b border-black/5 bg-white/90 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
              <Link
                href="/"
                className="flex items-center gap-2 text-red-800 transition-opacity hover:opacity-90"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-800 text-white shadow-sm">
                  <Home className="size-5" strokeWidth={2.5} />
                </span>
                <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-[var(--surface-900)]">
                  CribAI
                </span>
              </Link>

              {isAuthenticated && (
                <div className="hidden md:flex flex-1 max-w-md items-center">
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--surface-400)]" />
                    <input
                      type="text"
                      placeholder={`Search near ${campusSlug === 'uw-madison' ? 'UW-Madison' : campusSlug}...`}
                      className="w-full rounded-full border border-[var(--surface-200)] bg-[var(--surface-50)] py-2 pl-10 pr-4 text-sm text-[var(--surface-700)] focus:border-red-700 focus:outline-none focus:ring-2 focus:ring-red-700/15"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 md:gap-6">
                {isAuthenticated && (
                  <>
                    <Link
                      href="/explore"
                      className="hidden md:inline text-sm font-medium text-[var(--surface-600)] transition-colors hover:text-red-800"
                    >
                      Discover
                    </Link>
                    <Link
                      href="/messages"
                      className="hidden md:flex items-center gap-1 text-sm font-medium text-[var(--surface-600)] transition-colors hover:text-red-800"
                    >
                      <Sparkles className="size-4 text-slate-500" />
                      Agent
                    </Link>
                    <Link
                      href="/chat"
                      className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-red-800 transition-colors hover:text-red-900"
                    >
                      <MessageSquare className="size-4" />
                      Chat
                    </Link>
                    {isCrmEnabled() && (
                      <Link
                        href="/my-apartments"
                        className="hidden md:flex items-center gap-1 text-sm font-medium text-[var(--surface-600)] transition-colors hover:text-red-800"
                      >
                        <Building2 className="size-4 text-slate-500" />
                        My Apartments
                      </Link>
                    )}
                    <Link
                      href="/profile"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-sm font-semibold text-red-800 shadow-sm transition-colors hover:bg-red-200"
                      aria-label="Open profile"
                    >
                      {(resolvedUser?.user_metadata?.full_name as string | undefined)?.slice(0, 1) ?? 'U'}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </nav>
          {children}
        </div>
      </MainLayoutClient>
    </ConciergeShell>
  );
}
