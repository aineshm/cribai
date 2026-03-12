import { getCurrentUser } from '@/lib/get-current-user';
import { ExploreClient } from './ExploreClient';
import type { Listing } from '@/lib/mock-listings';

/** Placeholder gradient backgrounds for listings without photos */
const gradients = [
  'from-primary-200 to-primary-400',
  'from-secondary-200 to-secondary-400',
  'from-teal-200 to-emerald-400',
  'from-amber-200 to-orange-400',
  'from-rose-200 to-pink-400',
  'from-sky-200 to-blue-400',
  'from-violet-200 to-purple-400',
  'from-lime-200 to-green-400',
  'from-cyan-200 to-teal-400',
  'from-fuchsia-200 to-pink-400',
] as const;

export default async function ExplorePage() {
  const { supabase } = await getCurrentUser();

  // Look up default campus (UW-Madison)
  const { data: campus } = await supabase
    .from('campus_configs')
    .select('id, name')
    .eq('slug', 'uw-madison')
    .single();

  const campusId = campus?.id;
  const campusName = campus?.name ?? 'UW-Madison';

  let listings: readonly Listing[] = [];

  if (campusId) {
    const { data: rows } = await supabase
      .from('listings')
      .select(
        'id, address, rent_monthly, bedrooms, bathrooms, sqft, fairness_score, amenities, photo_urls, is_active'
      )
      .eq('campus_id', campusId)
      .eq('is_active', true)
      .order('rent_monthly', { ascending: true });

    listings = (rows ?? []).map((row, i): Listing => {
      const beds = row.bedrooms ?? 0;
      const title = beds === 0 ? `Studio at ${row.address}` : `${beds}BR at ${row.address}`;
      const photoUrls: readonly string[] = Array.isArray(row.photo_urls) ? row.photo_urls : [];

      return {
        id: row.id,
        title,
        address: row.address,
        price: Number(row.rent_monthly),
        beds,
        baths: Number(row.bathrooms ?? 1),
        sqft: Number(row.sqft ?? 0),
        distanceToCampus: 0,
        rating: Number(row.fairness_score ?? 0),
        photoUrls,
        placeholderGradient: gradients[i % gradients.length] ?? gradients[0],
        amenities: Array.isArray(row.amenities) ? row.amenities : [],
        isVerified: false,
        isSaved: false,
        landlord: { name: 'Unknown', rating: 0 },
      };
    });
  }

  return <ExploreClient initialListings={listings} campusName={campusName} />;
}
