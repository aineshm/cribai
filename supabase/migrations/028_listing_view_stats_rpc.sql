-- RPC function for efficient listing view statistics
-- Returns total_views and unique_viewers for a given listing from analytics_events
-- Only accessible by the listing creator (checks creator_id against auth.uid())

CREATE OR REPLACE FUNCTION get_listing_view_stats(p_listing_id uuid)
RETURNS TABLE(total_views bigint, unique_viewers bigint)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller owns this listing
  IF NOT EXISTS (
    SELECT 1 FROM listings WHERE id = p_listing_id AND creator_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::bigint AS total_views,
    COUNT(DISTINCT user_id)::bigint AS unique_viewers
  FROM analytics_events
  WHERE event = 'listing_viewed'
    AND metadata->>'listing_id' = p_listing_id::text;
END;
$$;
