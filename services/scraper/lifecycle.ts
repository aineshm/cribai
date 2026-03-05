import type { SupabaseClient } from '@supabase/supabase-js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface ArchiveResult {
  readonly archived: number;
  readonly deleted: number;
}

interface StaleRow {
  readonly id: string;
  readonly campus_id: string;
  readonly external_id: string;
  readonly source: string;
  readonly address: string;
  readonly rent_monthly: number | null;
  readonly first_seen_at: string | null;
  readonly last_seen_at: string | null;
}

/**
 * Archive listings that have been inactive for 30+ days.
 * Inserts metadata into listing_history, then deletes from listings.
 */
export async function archiveStaleListings(
  supabase: SupabaseClient,
  campusId: string,
): Promise<ArchiveResult> {
  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  // Select stale inactive listings (30+ days since last seen)
  const { data: staleListings, error: selectError } = await supabase
    .from('listings')
    .select('id, campus_id, external_id, source, address, rent_monthly, first_seen_at, last_seen_at')
    .eq('campus_id', campusId)
    .eq('is_active', false)
    .lt('last_seen_at', thirtyDaysAgo);

  if (selectError || !staleListings || staleListings.length === 0) {
    return { archived: 0, deleted: 0 };
  }

  const typedListings = staleListings as StaleRow[];

  // Archive to listing_history
  const archiveRows = typedListings.map((listing) => ({
    campus_id: listing.campus_id,
    external_id: listing.external_id,
    source: listing.source,
    address: listing.address,
    rent_monthly: listing.rent_monthly,
    first_seen_at: listing.first_seen_at,
    last_seen_at: listing.last_seen_at,
  }));

  const { error: insertError } = await supabase
    .from('listing_history')
    .insert(archiveRows);

  if (insertError) {
    console.error(`Archive insert error: ${insertError.message}`);
    return { archived: 0, deleted: 0 };
  }

  // Delete archived listings from listings table
  const { error: deleteError } = await supabase
    .from('listings')
    .delete()
    .eq('campus_id', campusId)
    .eq('is_active', false)
    .lt('last_seen_at', thirtyDaysAgo);

  if (deleteError) {
    console.error(`Archive delete error: ${deleteError.message}`);
    return { archived: typedListings.length, deleted: 0 };
  }

  return { archived: typedListings.length, deleted: typedListings.length };
}
