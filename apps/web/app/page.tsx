import Link from 'next/link';
import { createSecretClient } from '@campusnest/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = createSecretClient();
  const { data: campuses } = await supabase
    .from('campus_configs')
    .select('slug, name, university_name')
    .eq('is_public', true)
    .order('name');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 animate-fade-in">
      <h1 className="font-[family-name:var(--font-display)] text-5xl tracking-tight text-[var(--surface-900)]">
        CampusNest
      </h1>
      <p className="mt-4 text-lg text-[var(--surface-500)]">
        Student housing intelligence — fair prices, honest reviews, zero scams.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-4">
        {campuses && campuses.length > 0 ? (
          campuses.map((c) => (
            <Link
              key={c.slug}
              href={`/${c.slug}/listings`}
              className="group flex items-center gap-3 rounded-xl border-l-4 border-[var(--primary-600)] bg-white px-6 py-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 transition-all duration-200"
            >
              <span className="font-medium text-[var(--surface-800)] group-hover:text-[var(--primary-700)] transition-colors">
                {c.university_name ?? c.name}
              </span>
            </Link>
          ))
        ) : (
          <p className="text-[var(--surface-400)]">No campuses available yet.</p>
        )}
      </div>
      <div className="mt-8">
        <Link
          href="/login"
          className="text-sm text-[var(--primary-600)] hover:text-[var(--primary-700)] hover:underline transition-colors"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
