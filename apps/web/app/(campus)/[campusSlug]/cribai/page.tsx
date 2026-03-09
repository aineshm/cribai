import { cookies } from 'next/headers';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { CribAIChatPage } from './cribai-page-client';

export default async function CribAIPage({
  params,
  searchParams,
}: {
  params: Promise<{ campusSlug: string }>;
  searchParams: Promise<{ about?: string; address?: string }>;
}) {
  const { campusSlug } = await params;
  const { about, address } = await searchParams;

  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  // Check auth status
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthenticated = !!user;

  // Get campus ID for conversation creation
  let campusId: string | undefined;
  if (isAuthenticated) {
    const { data: campus } = await supabase
      .from('campus_configs')
      .select('id')
      .eq('slug', campusSlug)
      .single();
    campusId = campus?.id;
  }

  return (
    <CribAIChatPage
      campusSlug={campusSlug}
      campusId={campusId}
      isAuthenticated={isAuthenticated}
      initialListingId={about}
      initialAddress={address}
    />
  );
}
