import { fetchExploreListings } from '@/lib/listings-data';
import { ExploreClient } from './ExploreClient';

export default async function ExplorePage() {
  const listings = await fetchExploreListings();

  return <ExploreClient listings={listings} />;
}

export const dynamic = 'force-dynamic';
