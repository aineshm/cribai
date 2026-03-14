import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { Hero } from '@/components/landing/Hero';
import { SocialProof } from '@/components/landing/SocialProof';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { FooterCTA } from '@/components/landing/FooterCTA';
import { Footer } from '@/components/landing/Footer';
import { MobileStickyBar } from '@/components/landing/MobileStickyBar';

export default async function HomePage() {
  let isAuthenticated = false;

  try {
    const cookieStore = await cookies();
    const supabase = createServerComponentClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    let resolvedUser = user;
    if (!resolvedUser) {
      const headersList = await headers();
      const devJson = headersList.get('x-dev-user-json');
      resolvedUser = devJson ? (JSON.parse(devJson) as typeof user) : null;
    }

    isAuthenticated = !!resolvedUser;
  } catch (error) {
    console.error('[HomePage] Auth check failed, rendering as unauthenticated:', error);
  }

  const navHref = isAuthenticated ? '/explore' : '/login';
  const navText = isAuthenticated ? 'Dashboard' : 'Sign In';

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-50 glass border-b border-white/20 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
            CampusNest
          </span>
          <Link
            href={navHref}
            className="inline-flex items-center justify-center rounded-full bg-[var(--primary-600)] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-700)]"
          >
            {navText}
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1">
        <Hero isAuthenticated={isAuthenticated} />
        <SocialProof />
        <Features />
        <HowItWorks />
        <FooterCTA isAuthenticated={isAuthenticated} />
      </main>

      <Footer />
      <MobileStickyBar isAuthenticated={isAuthenticated} />
    </div>
  );
}
