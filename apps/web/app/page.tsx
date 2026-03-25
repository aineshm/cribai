import Link from 'next/link';
import Image from 'next/image';
import { cookies, headers } from 'next/headers';
import { createServerComponentClient } from '@campusnest/supabase/server';
import {
  ArrowRight,
  Building,
  CheckCircle2,
  Home,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { LandingMobileMenu } from '@/components/layout/LandingMobileMenu';

/** Force dynamic rendering — page checks auth via cookies. */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let isAuthenticated = false;

  try {
    const cookieStore = await cookies();
    const supabase = createServerComponentClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

  const primaryHref = isAuthenticated ? '/explore' : '/login';
  const primaryText = isAuthenticated ? 'Go to Explore' : "Get Started (it's free)";

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-white via-stone-50 to-white text-[var(--surface-900)]">
      <nav className="sticky top-0 z-50 border-b border-red-900/20 bg-red-900/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white shadow-sm">
              <Home className="size-5" strokeWidth={2.5} />
            </span>
            <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">CribAI</span>
          </Link>

          <LandingMobileMenu
            primaryHref={primaryHref}
            primaryText={isAuthenticated ? 'Dashboard' : 'Get Started'}
            agentHref={isAuthenticated ? '/messages' : '/login?returnTo=/messages'}
          />

          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-red-100">
            <Link href="/explore" className="transition-colors hover:text-white">
              Browse
            </Link>
            <Link href={isAuthenticated ? '/messages' : '/login?returnTo=/messages'} className="transition-colors hover:text-white">
              Agent
            </Link>
            <Link
              href={primaryHref}
              className="rounded-xl bg-white px-5 py-2.5 text-red-900 font-semibold shadow-sm transition-colors hover:bg-red-50"
            >
              {isAuthenticated ? 'Dashboard' : 'Get Started'}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden pt-16 pb-20 lg:pt-24">
          <div className="absolute -top-10 -right-20 h-[28rem] w-[28rem] rounded-full bg-red-100/60 blur-[100px]" />
          <div className="absolute -bottom-10 -left-20 h-80 w-80 rounded-full bg-stone-200/50 blur-[80px]" />
          <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">

          <div className="relative flex flex-col gap-6">
            <div className="inline-flex w-max items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800">
              <Sparkles className="size-4 text-slate-500" />
              <span>AI-powered apartment search for students</span>
            </div>

            <div className="space-y-4">
              <h1 className="font-[family-name:var(--font-display)] max-w-2xl text-5xl font-extrabold leading-[1.05] tracking-tight text-[var(--surface-900)] sm:text-6xl">
                Find your perfect college apartment
                <span className="text-red-800"> with AI that actually understands.</span>
              </h1>
              <p className="max-w-xl text-lg leading-8 text-[var(--surface-600)]">
                Skip the endless scrolling and sketchy listings. Describe your budget, commute,
                roommates, and must-haves in plain English, then let CribAI do the hard part.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                href={primaryHref}
                className="inline-flex items-center justify-center rounded-2xl bg-red-800 px-8 py-3.5 text-lg font-semibold text-white shadow-lg shadow-red-900/15 transition-all hover:-translate-y-0.5 hover:bg-red-900"
              >
                {primaryText}
              </Link>
              <Link
                href="/explore"
                className="inline-flex items-center justify-center rounded-2xl border-2 border-[var(--surface-200)] bg-white px-8 py-3.5 text-lg font-semibold text-[var(--surface-700)] transition-colors hover:bg-[var(--surface-50)]"
              >
                See how it works
              </Link>
            </div>

            <p className="flex items-center gap-2 text-sm text-[var(--surface-500)]">
              <CheckCircle2 className="size-4 text-emerald-600" />
              Exclusively for verified `.edu` students
            </p>

            {/* Mobile-only chat bubble card — social proof visible above the fold */}
            <div className="lg:hidden rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
                  <Sparkles className="size-4 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    &ldquo;I need a 2-bedroom under $800/mo that allows cats, near Engineering.&rdquo;
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-sm font-bold text-red-700">
                    <span>Found 12 matching listings</span>
                    <ArrowRight className="size-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative lg:h-[600px] h-[400px] overflow-hidden rounded-[2rem] shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <Image
              src="https://images.unsplash.com/photo-1653087861508-55e4f51b393b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"
              alt="Students in a bright apartment"
              fill
              priority
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.08),rgba(15,23,42,0.12))]" />
            <div className="absolute bottom-6 left-6 right-6 rounded-[1.5rem] border border-white/20 bg-white/95 p-4 shadow-xl backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                  <Sparkles className="size-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    &ldquo;I need a 2-bedroom under $800/mo that allows cats, within a 10-minute
                    walk to the Engineering building.&rdquo;
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm font-bold text-red-700">
                    <span>Found 12 matching listings</span>
                    <ArrowRight className="size-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </section>

        <section className="border-y border-red-900/10 bg-red-900 py-10">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <p className="mb-6 text-sm font-semibold uppercase tracking-[0.24em] text-red-200">
              Starting at UW-Madison
            </p>
            <div className="flex flex-wrap justify-center gap-8 text-xl font-semibold text-red-200">
              <span className="text-white">UW-Madison</span>
              <span className="text-sm self-center text-red-300">More campuses coming soon</span>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="font-[family-name:var(--font-display)] text-4xl font-bold text-[var(--surface-900)]">
              Apartment hunting, rebuilt for students.
            </h2>
            <p className="mt-4 text-lg text-[var(--surface-600)]">
              We kept the trust, added AI, and cut out the friction.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Search,
                tone: 'bg-red-800 text-white',
                title: 'AI-powered search',
                description:
                  'Describe your needs in plain English and get ranked matches by budget, vibe, commute, and lease fit.',
              },
              {
                icon: ShieldCheck,
                tone: 'bg-slate-400 text-slate-950',
                title: 'Verified student network',
                description:
                  'CribAI is built around `.edu` trust, real tenant context, and safer landlord discovery.',
              },
              {
                icon: Building,
                tone: 'bg-red-100 text-red-800',
                title: 'End-to-end support',
                description:
                  'Search, compare, ask AI, schedule tours, and post summer subleases from one place.',
              },
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-[1.75rem] border border-[var(--surface-200)] bg-white p-7 shadow-[0_12px_32px_rgba(0,0,0,0.04)] transition-transform hover:-translate-y-1"
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${feature.tone}`}>
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-6 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--surface-900)]">
                    {feature.title}
                  </h3>
                  <p className="mt-3 leading-7 text-[var(--surface-600)]">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="relative overflow-hidden bg-red-900 py-24 text-white">
          <div className="absolute top-0 right-[-10%] h-80 w-80 rounded-full bg-red-800 blur-3xl" />
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-16 text-center font-[family-name:var(--font-display)] text-4xl font-bold">How CribAI works</h2>
            <div className="grid gap-10 md:grid-cols-3">
              {[
                ['01', 'Sign up with .edu', 'Create your student account and unlock verified-only search.'],
                ['02', 'Tell AI what you need', 'Budget, roommates, pets, commute, neighborhood, sublease dates.'],
                ['03', 'Match, tour, and sign', 'Review curated listings, ask follow-up questions, and move fast.'],
              ].map(([step, title, description]) => (
                <div key={step} className="relative text-center">
                  <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border-4 border-red-900 bg-red-800 text-3xl font-semibold text-slate-300 shadow-xl">
                    {step}
                  </div>
                  <h3 className="text-2xl font-semibold">{title}</h3>
                  <p className="mt-3 text-[15px] leading-7 text-red-100">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="bg-[var(--surface-50)] pt-20 pb-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-20 rounded-[2rem] bg-gradient-to-br from-red-800 to-red-950 px-8 py-14 text-center shadow-xl shadow-red-900/20 md:px-16">
              <h2 className="font-[family-name:var(--font-display)] text-4xl font-bold text-white sm:text-5xl">
                Ready to find your nest?
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-red-100">
                Join the first wave of students using CribAI to find better-fit apartments
                and summer subleases faster.
              </p>
              <Link
                href={primaryHref}
                className="mt-8 inline-flex items-center justify-center rounded-2xl bg-[var(--surface-900)] px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-black"
              >
                {isAuthenticated ? 'Open Explore' : 'Create free account'}
              </Link>
            </div>

            <div className="flex flex-col items-center justify-between gap-5 text-sm text-[var(--surface-500)] md:flex-row">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-red-800" />
                <span className="font-semibold text-[var(--surface-900)]">CribAI</span>
                <span>© 2026. Built by students, for students.</span>
              </div>
              <div className="flex gap-6">
                <Link href="/privacy" className="transition-colors hover:text-red-800">
                  Privacy
                </Link>
                <Link href="/terms" className="transition-colors hover:text-red-800">
                  Terms
                </Link>
                <Link href="/explore" className="transition-colors hover:text-red-800">
                  Explore
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </main>

      {/* Removed: duplicate fixed-bottom CTA on mobile — hero CTA is sufficient */}
    </div>
  );
}
