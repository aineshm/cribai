import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { ConciergeShell } from '@/components/concierge/ConciergeShell';
import { ConciergeNavButton } from '@/components/concierge/ConciergeNavButton';

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

  return (
    <ConciergeShell>
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
                </>
              )}
              <ConciergeNavButton />
            </div>
          </div>
        </nav>
        {children}
      </div>
    </ConciergeShell>
  );
}
