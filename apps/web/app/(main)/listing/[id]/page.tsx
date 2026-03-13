import { notFound } from 'next/navigation';
import { fetchListingById } from '@/lib/listings-data';
import { ListingDetailClient } from './ListingDetailClient';

interface ListingDetailPageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ListingDetailPage({
  params,
}: ListingDetailPageProps) {
  const { id } = await params;
  const listing = await fetchListingById(id);

  if (!listing) {
    notFound();
  }

  return <ListingDetailClient listing={listing} />;
}

export const dynamic = 'force-dynamic';

export function generateMetadata() {
  return {
    title: 'Listing Detail — CampusNest',
    description: 'View listing details, amenities, lease terms, and more.',
  };
}
