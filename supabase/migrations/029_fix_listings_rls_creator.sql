-- Migration 029: Fix listings RLS to allow creators to read their own listings
-- The existing campus_listings_select policy only allows reading listings
-- matching the user's campus_id. Creators cannot see their own sublease
-- listings on the "My Listings" profile tab.

-- Drop and recreate with OR creator_id = auth.uid()
DROP POLICY IF EXISTS "campus_listings_select" ON listings;

CREATE POLICY "campus_listings_select" ON listings
  FOR SELECT USING (
    campus_id = (
      SELECT campus_id FROM profiles WHERE id = auth.uid()
    )
    OR creator_id = auth.uid()
  );
