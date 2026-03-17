import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import { cookies } from 'next/headers';

/**
 * GET /api/listings/[id]/stats — listing view statistics.
 * Returns total views and unique viewers from analytics_events.
 * Only accessible to the listing creator (creator_id must match auth user).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: listingId } = await params;

  if (!listingId) {
    return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 });
  }

  // Authenticate user
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Verify the user is the listing creator
  const serviceClient = createSecretClient();
  const { data: listing, error: listingError } = await serviceClient
    .from('listings')
    .select('creator_id')
    .eq('id', listingId)
    .single();

  if (listingError || !listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (listing.creator_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Query analytics_events for listing_viewed events matching this listing
  const { data: stats, error: statsError } = await serviceClient
    .rpc('get_listing_view_stats', { p_listing_id: listingId });

  if (statsError) {
    // Fallback: query directly if RPC doesn't exist yet
    console.error('[listing-stats] RPC error, using fallback query:', statsError);
    return await fallbackQuery(serviceClient, listingId);
  }

  const row = stats?.[0] ?? { total_views: 0, unique_viewers: 0 };

  return NextResponse.json({
    listingId,
    totalViews: Number(row.total_views),
    uniqueViewers: Number(row.unique_viewers),
  });
}

/**
 * Fallback direct query if the RPC function hasn't been deployed yet.
 * Uses two separate count queries against analytics_events.
 */
async function fallbackQuery(
  serviceClient: ReturnType<typeof createSecretClient>,
  listingId: string
) {
  // Total views: count all listing_viewed events for this listing
  const { count: totalViews, error: totalError } = await serviceClient
    .from('analytics_events')
    .select('id', { count: 'exact', head: true })
    .eq('event', 'listing_viewed')
    .eq('metadata->>listing_id', listingId);

  if (totalError) {
    console.error('[listing-stats] Total views query error:', totalError);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }

  // Unique viewers: count distinct user_id values
  // Supabase JS client doesn't support COUNT(DISTINCT), so we fetch user_ids and dedupe
  const { data: viewerRows, error: viewerError } = await serviceClient
    .from('analytics_events')
    .select('user_id')
    .eq('event', 'listing_viewed')
    .eq('metadata->>listing_id', listingId)
    .not('user_id', 'is', null);

  if (viewerError) {
    console.error('[listing-stats] Unique viewers query error:', viewerError);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }

  const uniqueViewers = new Set(
    (viewerRows ?? []).map((r: { user_id: string }) => r.user_id)
  ).size;

  return NextResponse.json({
    listingId,
    totalViews: totalViews ?? 0,
    uniqueViewers,
  });
}
