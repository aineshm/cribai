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
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight">CampusNest</h1>
      <p className="mt-4 text-lg text-gray-600">
        Student housing intelligence — fair prices, honest reviews, zero scams.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        {campuses && campuses.length > 0 ? (
          campuses.map((c) => (
            <Link
              key={c.slug}
              href={`/${c.slug}/listings`}
              className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              {c.university_name ?? c.name}
            </Link>
          ))
        ) : (
          <p className="text-gray-500">No campuses available yet.</p>
        )}
      </div>
      <div className="mt-8">
        <Link
          href="/login"
          className="text-sm text-blue-600 hover:underline"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
