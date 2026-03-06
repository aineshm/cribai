import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedListing } from './normalizer';

export interface PriceChange {
  readonly listingId: string;
  readonly address: string;
  readonly campusSlug: string;
  readonly oldPrice: number;
  readonly newPrice: number;
}

/**
 * Compare scraped listings against current DB prices.
 * Must be called BEFORE upsert so old prices are still in DB.
 */
export async function detectPriceChanges(
  supabase: SupabaseClient,
  campusId: string,
  campusSlug: string,
  normalizedListings: readonly NormalizedListing[],
): Promise<readonly PriceChange[]> {
  // Filter to listings that have a price
  const pricedListings = normalizedListings.filter(
    (l) => l.rentMonthly != null,
  );
  if (pricedListings.length === 0) return [];

  const externalIds = pricedListings.map((l) => l.externalId);

  const { data: currentListings } = await supabase
    .from('listings')
    .select('id, external_id, source, rent_monthly, address')
    .eq('campus_id', campusId)
    .in('external_id', externalIds);

  if (!currentListings || currentListings.length === 0) return [];

  // Build lookup: external_id:source -> current listing
  const currentPriceMap = new Map(
    currentListings.map((l) => [
      `${l.external_id}:${l.source}`,
      l as {
        id: string;
        external_id: string;
        source: string;
        rent_monthly: number | null;
        address: string;
      },
    ]),
  );

  const changes: PriceChange[] = [];
  for (const listing of pricedListings) {
    const current = currentPriceMap.get(
      `${listing.externalId}:${listing.source}`,
    );
    if (!current || current.rent_monthly == null) continue;
    if (current.rent_monthly === listing.rentMonthly) continue;

    changes.push({
      listingId: current.id,
      address: current.address,
      campusSlug,
      oldPrice: current.rent_monthly,
      newPrice: listing.rentMonthly!,
    });
  }

  return changes;
}

/**
 * Create notification records for users who saved listings with price changes.
 * Uses service-role client which bypasses RLS.
 */
export async function createPriceChangeNotifications(
  supabase: SupabaseClient,
  changes: readonly PriceChange[],
): Promise<number> {
  if (changes.length === 0) return 0;

  const listingIds = changes.map((c) => c.listingId);

  const { data: saves } = await supabase
    .from('saved_listings')
    .select('user_id, listing_id')
    .in('listing_id', listingIds);

  if (!saves || saves.length === 0) return 0;

  // Build change lookup by listing_id
  const changeMap = new Map(changes.map((c) => [c.listingId, c]));

  const notifications = saves.map((save) => {
    const change = changeMap.get(save.listing_id)!;
    return {
      user_id: save.user_id,
      listing_id: change.listingId,
      type: 'price_change' as const,
      payload: {
        listing_address: change.address,
        campus_slug: change.campusSlug,
        old_price: change.oldPrice,
        new_price: change.newPrice,
        change_pct:
          Math.round(
            ((change.newPrice - change.oldPrice) / change.oldPrice) * 1000,
          ) / 10,
      },
    };
  });

  const { error } = await supabase.from('notifications').insert(notifications);

  if (error) {
    console.error('Notification insert error:', error.message);
    return 0;
  }

  return notifications.length;
}
