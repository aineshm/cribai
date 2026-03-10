import Link from 'next/link';
import { createSecretClient } from '@campusnest/supabase/server';

export default async function HomePage() {
  const supabase = createSecretClient();
  const { data: campuses } = await supabase
    .from('campus_configs')
    .select('slug, name, university_name')
    .eq('is_public', true)
    .order('name');

  const campusList = campuses ?? [];
  const defaultCampusSlug = campusList[0]?.slug ?? 'uw-madison';

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Nav */}
      <nav className="border-b border-[var(--surface-200)] bg-white/80 backdrop-blur-sm px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
            CampusNest
          </span>
          <Link
            href="/login"
            className="rounded-lg bg-[var(--primary-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-700)] transition-colors"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 pt-16 pb-12 text-center">
          <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl text-[var(--surface-900)] leading-tight">
            Student housing,
            <br />
            <span className="text-[var(--primary-600)]">finally transparent</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[var(--surface-500)]">
            True Cost Calculator, Price Fairness Scores, and an AI advisor — so you never overpay for an apartment again.
          </p>
        </section>

        {/* Campus Selector */}
        <section className="mx-auto max-w-2xl px-6 pb-16">
          <h2 className="text-center text-sm font-medium uppercase tracking-wider text-[var(--surface-400)] mb-4">
            Select your campus
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {campusList.map((campus) => (
              <Link
                key={campus.slug}
                href={`/${campus.slug}/listings`}
                className="group flex items-center gap-4 rounded-xl border border-[var(--surface-200)] bg-white p-5 shadow-sm hover:border-[var(--primary-300)] hover:shadow-[var(--shadow-card)] transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-50)] text-[var(--primary-600)]">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-[var(--surface-800)] group-hover:text-[var(--primary-700)] transition-colors">
                    {campus.university_name}
                  </p>
                  <p className="text-xs text-[var(--surface-400)]">Browse listings</p>
                </div>
                <svg className="h-5 w-5 text-[var(--surface-300)] group-hover:text-[var(--primary-500)] transition-colors" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}

            {campusList.length === 0 && (
              <Link
                href={`/${defaultCampusSlug}/listings`}
                className="group flex items-center gap-4 rounded-xl border border-[var(--surface-200)] bg-white p-5 shadow-sm hover:border-[var(--primary-300)] hover:shadow-[var(--shadow-card)] transition-all sm:col-span-2"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-50)] text-[var(--primary-600)]">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-[var(--surface-800)]">University of Wisconsin-Madison</p>
                  <p className="text-xs text-[var(--surface-400)]">Browse listings</p>
                </div>
                <svg className="h-5 w-5 text-[var(--surface-300)] group-hover:text-[var(--primary-500)] transition-colors" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-[var(--surface-400)]">
            Or <Link href={`/${defaultCampusSlug}/cribai`} className="text-[var(--primary-600)] hover:underline">ask CribAI</Link> to find your next place.
          </p>
        </section>

        {/* Features */}
        <section className="border-t border-[var(--surface-200)] bg-white py-16">
          <div className="mx-auto max-w-4xl px-6">
            <div className="grid gap-8 sm:grid-cols-3">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-50)]">
                  <svg className="h-6 w-6 text-[var(--primary-600)]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008H15.75v-.008zm0 2.25h.008v.008H15.75V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
                  </svg>
                </div>
                <h3 className="mt-3 font-[family-name:var(--font-display)] text-lg text-[var(--surface-800)]">True Cost Calculator</h3>
                <p className="mt-1 text-sm text-[var(--surface-500)]">
                  See the real monthly cost including utilities, parking, and fees — not just the listed rent.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-50)]">
                  <svg className="h-6 w-6 text-[var(--primary-600)]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <h3 className="mt-3 font-[family-name:var(--font-display)] text-lg text-[var(--surface-800)]">Fairness Scores</h3>
                <p className="mt-1 text-sm text-[var(--surface-500)]">
                  Every listing rated 1–10 against comparable properties so you know if the price is fair.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-50)]">
                  <svg className="h-6 w-6 text-[var(--primary-600)]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                </div>
                <h3 className="mt-3 font-[family-name:var(--font-display)] text-lg text-[var(--surface-800)]">CribAI Advisor</h3>
                <p className="mt-1 text-sm text-[var(--surface-500)]">
                  Ask questions, compare apartments, understand lease terms, and schedule tours — all through chat.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--surface-200)] bg-white px-6 py-6">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--surface-400)]">
          <span>CampusNest</span>
          <div className="flex gap-6">
            <span>About</span>
            <span>Terms</span>
            <span>Privacy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
