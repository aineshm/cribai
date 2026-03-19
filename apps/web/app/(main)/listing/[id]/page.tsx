import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import { fetchListingById } from '@/lib/listings-data';
import { ListingDetailClient } from './ListingDetailClient';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

interface ListingDetailPageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ campus?: string }>;
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: ListingDetailPageProps) {
  const { id } = await params;
  const { campus } = await searchParams;
  const listing = await fetchListingById(id);

  if (!listing) {
    notFound();
  }

  // Check if current user is creator or admin
  let isCreatorOrAdmin = false;
  let currentUserId: string | null = null;
  let creatorName: string | null = null;

  try {
    const cookieStore = await cookies();
    const supabase = createServerComponentClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      currentUserId = user.id;
      const isCreator = listing.creatorId === user.id;
      const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');
      isCreatorOrAdmin = isCreator || isAdmin;
    }
  } catch {
    // Auth check failed silently — user is not logged in
  }

  // Fetch creator display name for sublease attribution
  if (listing.source === 'sublease' && listing.creatorId) {
    try {
      const serviceClient = createSecretClient();
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('display_name')
        .eq('id', listing.creatorId)
        .single();
      creatorName = (profile?.display_name as string) ?? null;
    } catch {
      // Profile fetch failed — show "a verified student" fallback
    }
  }

  return (
    <ListingDetailClient
      listing={listing}
      campusSlug={campus}
      isCreatorOrAdmin={isCreatorOrAdmin}
      currentUserId={currentUserId}
      creatorName={creatorName}
    />
  );
}

export const dynamic = 'force-dynamic';

export function generateMetadata() {
  return {
    title: 'Listing Detail — CribAI',
    description: 'View listing details, amenities, lease terms, and more.',
  };
}
