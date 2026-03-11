import { getMockListingById } from '@/lib/mock-listing-detail';
import { ListingDetailClient } from './ListingDetailClient';

interface ListingDetailPageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ListingDetailPage({
  params,
}: ListingDetailPageProps) {
  const { id } = await params;
  const listing = getMockListingById(id);

  if (!listing) {
    return <div>Listing not found</div>;
  }

  return <ListingDetailClient listing={listing} />;
}

export function generateMetadata() {
  return {
    title: 'Listing Detail — CampusNest',
    description: 'View listing details, amenities, lease terms, and more.',
  };
}
