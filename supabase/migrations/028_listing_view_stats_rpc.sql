-- RPC function for efficient listing view statistics
-- Returns total_views and unique_viewers for a given listing from analytics_events

CREATE OR REPLACE FUNCTION get_listing_view_stats(p_listing_id uuid)
RETURNS TABLE(total_views bigint, unique_viewers bigint)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*)::bigint AS total_views,
    COUNT(DISTINCT user_id)::bigint AS unique_viewers
  FROM analytics_events
  WHERE event = 'listing_viewed'
    AND metadata->>'listing_id' = p_listing_id::text;
$$;
