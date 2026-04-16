import { fetchFeaturedExploreListings } from '@/lib/listings-data';
import { ExploreClient } from './ExploreClient';

export default async function ExplorePage() {
  const featuredListings = await fetchFeaturedExploreListings(12);

  return <ExploreClient featuredListings={featuredListings} />;
}

export const dynamic = 'force-dynamic';
