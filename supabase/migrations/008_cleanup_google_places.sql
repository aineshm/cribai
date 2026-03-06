-- Mark all Google Places listings as inactive (they have no rent/beds data)
UPDATE listings
SET is_active = false,
    updated_at = now()
WHERE source = 'google_places'
  AND is_active = true;
