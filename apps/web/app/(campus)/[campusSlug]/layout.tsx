import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { CampusProvider } from '../../../lib/campus-context';
import { AuthNav } from '../../../components/auth-nav';

export default async function CampusLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ campusSlug: string }>;
}) {
  const { campusSlug } = await params;
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isEduVerified = false;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_edu_verified')
      .eq('id', user.id)
      .single();
    isEduVerified = profile?.is_edu_verified ?? false;
  }

  return (
    <CampusProvider campus={campusConfig}>
      <div className="min-h-screen">
        <nav className="border-b bg-white px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-xl font-bold">
                CampusNest
              </Link>
              <span className="text-sm text-gray-500">
                {campusConfig.universityName}
              </span>
            </div>
            <div className="flex items-center gap-6">
              <Link
                href={`/${campusSlug}/listings`}
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Listings
              </Link>
              <Link
                href={`/${campusSlug}/cribai`}
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                CribAI
              </Link>
              <AuthNav
                userEmail={user?.email ?? null}
                isEduVerified={isEduVerified}
              />
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </CampusProvider>
  );
}
