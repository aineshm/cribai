import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { ProfilePageClient } from '@/components/profile/ProfilePageClient';

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Dev-auth fallback: read injected header when no Supabase session exists
  let resolvedUser = user;
  if (!resolvedUser) {
    const headersList = await headers();
    const devJson = headersList.get('x-dev-user-json');
    resolvedUser = devJson ? (JSON.parse(devJson) as typeof user) : null;
  }

  if (!resolvedUser) {
    redirect('/login?returnTo=/profile');
  }

  const meta = resolvedUser.user_metadata ?? {};

  const name =
    (meta.full_name as string | undefined) ??
    (meta.display_name as string | undefined) ??
    resolvedUser.email?.split('@')[0] ??
    'Student';

  const email = resolvedUser.email ?? '';

  const university =
    (meta.university as string | undefined) ?? 'University of Wisconsin-Madison';

  const graduationYear = String(
    (meta.graduation_year as string | number | undefined) ??
      (meta.graduationYear as string | number | undefined) ??
      ''
  );

  const memberSince = new Date(resolvedUser.created_at).toLocaleDateString(
    'en-US',
    { month: 'short', year: 'numeric' }
  );

  // Real Supabase users have email_confirmed_at; dev-auth users default to verified
  const isVerified =
    'email_confirmed_at' in resolvedUser
      ? !!resolvedUser.email_confirmed_at
      : true;

  // Fetch saved listings from DB
  const { data: savedRows } = await supabase
    .from('saved_listings')
    .select('listing_id, listings(id, address, rent_monthly, bedrooms, photo_urls)')
    .eq('user_id', resolvedUser.id);

  const savedListings = (savedRows ?? []).map((row) => {
    const listing = row.listings as unknown as {
      id: string;
      address: string;
      rent_monthly: number;
      bedrooms: number | null;
      photo_urls: string[] | null;
    } | null;
    const beds = listing?.bedrooms ?? 0;
    const title = beds === 0
      ? `Studio at ${listing?.address ?? 'Unknown'}`
      : `${beds}BR at ${listing?.address ?? 'Unknown'}`;
    const photoUrls = listing?.photo_urls ?? [];
    return {
      id: listing?.id ?? row.listing_id,
      title,
      address: listing?.address ?? '',
      price: Number(listing?.rent_monthly ?? 0),
      imageUrl: photoUrls[0] ?? undefined,
    };
  });

  return (
    <ProfilePageClient
      name={name}
      email={email}
      university={university}
      graduationYear={graduationYear}
      memberSince={memberSince}
      isVerified={isVerified}
      savedListings={savedListings}
    />
  );
}
