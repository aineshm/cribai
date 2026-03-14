import { notFound } from 'next/navigation';
import { fetchListingById } from '@/lib/listings-data';
import { ListingDetailClient } from './ListingDetailClient';

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

  return <ListingDetailClient listing={listing} campusSlug={campus} />;
}

export const dynamic = 'force-dynamic';

export function generateMetadata() {
  return {
    title: 'Listing Detail — CampusNest',
    description: 'View listing details, amenities, lease terms, and more.',
  };
}
