import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { Sparkles } from 'lucide-react';
import { ConciergeShell } from '@/components/concierge/ConciergeShell';
import { MainLayoutClient } from '@/components/layout/MainLayoutClient';

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
        <div className="min-h-[100dvh]">
          <nav className="sticky top-0 z-50 border-b border-[var(--surface-200)] bg-white/80 backdrop-blur-sm px-6 py-4">
            <div className="mx-auto flex max-w-6xl items-center justify-between">
              <Link
                href="/"
                className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]"
              >
                CampusNest
              </Link>
              <div className="flex items-center gap-4">
                {isAuthenticated && (
                  <>
                    <Link
                      href="/explore"
                      className="text-sm text-[var(--surface-600)] hover:text-[var(--surface-900)] transition-colors"
                    >
                      Explore
                    </Link>
                    <Link
                      href="/post"
                      className="text-sm text-[var(--surface-600)] hover:text-[var(--surface-900)] transition-colors"
                    >
                      Post
                    </Link>
                    <Link
                      href="/profile"
                      className="text-sm text-[var(--surface-600)] hover:text-[var(--surface-900)] transition-colors"
                    >
                      Profile
                    </Link>
                    <Link
                      href="/chat"
                      className="flex items-center gap-1.5 text-sm font-medium text-[var(--surface-500)] hover:text-[var(--surface-800)] transition-colors"
                    >
                      <Sparkles className="size-4" />
                      Chat
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
