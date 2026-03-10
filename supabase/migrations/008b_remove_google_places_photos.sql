-- Remove places.googleapis.com URLs from photo_urls arrays
-- These are legacy URLs from the removed GooglePlacesScraper that return 403
UPDATE listings
SET photo_urls = (
  SELECT COALESCE(
    array_agg(url ORDER BY ordinality),
    ARRAY[]::text[]
  )
  FROM unnest(photo_urls) WITH ORDINALITY AS t(url, ordinality)
  WHERE url NOT LIKE '%places.googleapis.com%'
)
WHERE EXISTS (
  SELECT 1 FROM unnest(photo_urls) AS url
  WHERE url LIKE '%places.googleapis.com%'
);
